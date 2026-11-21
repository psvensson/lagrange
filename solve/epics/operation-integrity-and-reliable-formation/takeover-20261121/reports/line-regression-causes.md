# Line-regression causes, stage 1 (root cause per group, by evidence)

Agent `claude:line-regressions`, 2026-11-21 ~15:25-16:20Z. Stage 1 only: no `src/` change, no assertion
change, no repair. Instruction sources: CLAUDE.md, `docs/steering/rules.md` (R04, R07, R11, R19),
`test/guidelines/INDEX.md`, the lead's brief and the coordinator's G2 follow-up. Head read: 23344cddc
(worktree `/mnt/data/peter/projects/.worktrees/line-regression-causes-20261121`, detached for the probes;
the work branch is untouched). Marking: **[X]** executed (sha, host, directory) - **[R]** read from source or
git - **[I]** inferred.

## 0. Executed probes

All on adam-laptop through `tools/focused.mjs`, check base 0dbed1718; ref `probe/line-regression-groups`
(pushed; local branch of the same name), three commits on a detached HEAD over 23344cddc, test files and
hook-regenerated metadata only, not for landing.

| Probe | Sha | Result | Directory under `lab/` |
|---|---|---|---|
| Test-side captures in 10 red files (G1, G2, G3, G12 x3, G13, G18, G19) | b07094a76b4b981049f747cad2c015bb59cf8040 | 10/10 red, 427 assertions; every file's first failure is the same case as in the retained f580579a5 runs, so the captures did not change behaviour | `lr-probe-b07094a76-1/` (+`.console.log`) |
| Named-write verdict table on the REAL producers (`test/query/named-write-verdict-table-probe.test.js`) | 28d3ff7bcc437ab07e533e7b256fc36515a7c291 | passed; the classified runner prints only failing files, so no row was retained; NOT a result | `lr-verdict-28d3ff7bc-1/` |
| Same, plus one deliberate final failure so the rows are kept | 939b8c7b42d805bba405793646f39d7b28e5a8c8 | 5 probe cases ran, 32 verdict rows retained; the 6th case fails by design | `lr-verdict-939b8c7b4-1/` |

Captures are `# PROBE <label>` / `# PROBE VERDICT {json}` lines in each directory's `.log` (util.inspect of
the error with its stack and `[cause]` chain, or of the write answer), placed at the test's own assertion
point or wrapping an instance method the test already holds. No assertion and no `src/` byte changed.

## Summary

| Group | Frame / cause | Introducing commit | Class | Real cluster |
|---|---|---|---|---|
| G2 (+G13, G18, PG-wire G12) | TypeError at `belongsToNamedWrite` (`control-plane-named-write-outcome.js:30`) via `isCommittedPartitionSuccess` :38 on a receipt-less answer | 7d261f681 | product defect in the judge (not total) + unmigrated contract change in the fakes of ~23 red files | not reached by any real producer (verdict table); 0 hits in GCP logs |
| G1 | receipt-less `{success:true}` judged UNKNOWN; registration UNRESOLVED -> "Failed to register node" | 7d261f681 | unmigrated contract change (fixture debt); owned continuation is correct | no |
| G3 | same UNKNOWN; endpoint throttle stamp not written, so each beat re-drives; coalescing owner unchanged | 7d261f681 (+8540d6b7a for the shape pin) | fixture debt + stale contract pin | rate unchanged with real receipts |
| G12 quorum | `assertProvisioningAttemptBudget` throws TIMEOUT with an EMPTY message (`QUERY_ERROR_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT` is undefined) before any admission read | 73fbf0576 | product defect (message) + test budget below the new fence | yes, any exhausted provisioning deadline |
| G12 seed 500 | `CDC_REQUIRED` (deferRetry) answered 500; pre-CDC SQL fallback removed | 7d261f681 | intended removal, test on removed path; 500-for-deferRetry is a sibling gap | seed: no (HTTP opens after CDC hydration) |
| G19 | coordinator refuses a partition ADD naming `replicaId`, reusing `placement_admission_bytes_invalid` | merge 268d439b2 | intended contract change, test not migrated; misleading code | 0 hits in GCP logs |

## 1. One cause behind G1, G2, G3, G13, G18 and the PG-wire part of G12: the named-write settlement rule of 7d261f681

### 1.1 What changed (introducing commit, by reading) [R]

`git log --oneline 49495f7e4..23344cddc -- src/control-plane/control-plane-named-write-outcome.js` gives
7d261f681 (module born, 2026-11-21 07:56, "Recover named control-plane writes through the current admitted
gateway", no body), 3cfe28456, 6144769da, d471620a9. 7d261f681 replaced the settlement rule of every
NAMED control-plane write (`settleInstance`, `src/control-plane/control-plane-write-identity.js`):

```
-function judgeAttempt(answer, thrown) {
-  if (someLinkedAnswer(answer, isWriteOutcomeUnknown)) {
-    return ATTEMPT_VERDICT.UNKNOWN;
-  }
-  if (!thrown && answer?.success !== false) {
-    return ATTEMPT_VERDICT.SETTLED;
-  }
...
+  const verdict = judgeNamedWriteOutcome(answer, record.key);
+  const releases = verdict === NAMED_WRITE_ATTEMPT.APPLIED ||
+    verdict === NAMED_WRITE_ATTEMPT.FAILED || ...
```

and the new judge (`control-plane-named-write-outcome.js`, at 7d261f681 inside `judgePartitionAnswer`, split
into `isCommittedPartitionSuccess` by 3cfe28456, unchanged in substance since):

```
+  const witness = result.durableCommitWitness;
+  if (result.success === true && result.deferRetry !== true && hasAffectedRows(result) &&
+      witness?.partitionId === result.partitionId && belongsToEntry(witness, key) &&
```

Before: any answer that was not thrown and not `success:false` SETTLED the named instance. After: only an
answer carrying the producer's durable commit receipt bound to the named entry (witness partition,
`witness.entryId === deriveParticipantEntryId(key, partition)`, logIndex, term), or a complete distributed
`participantResults` set of such receipts, is APPLIED; everything else is UNKNOWN. Which writes are named
did NOT change on the line: registration (`registrationWriteIdentity`), the endpoint authority, retryable
owner writes (`runRetryableControlPlaneWrite` mints a name) and replica_operations
(`withMutationWriteIdentity`) were already named at 49495f7e4 [R]. 6144769da (08:08) then carried
`durableCommitWitness` through the producers (`parallel-query-partition-outcomes.js`,
`buildDistributedMutationResult`), so the real producers emit the receipt; the test fakes were not moved.

Decision record: quest fresh-formation-user-table-routability, log line 370 (verification, reject at
1421ac153, 06:43:29Z): "an empty actual CDC reply is normalized without success, classified as settled by
judgeAttempt, and loses E1 before unavailable readback can reconcile. Require ... strict typed outcome at
each real producer", and line 382 (06:43:37Z): "its negative success check settles a reply without a typed
success. Both current gateway ingress producers (explicit system SQL and structured CDC mutation) and named
caller settlement scopes are in this repair." Line 401 (08:55Z) already saw "test/query/write-identity-instance
... failed nine of 17 cases ... including missing CDC construction ... Check each fixture against the
production construction". No record migrates or names the ~23 consumer test files that went red (G1 7, G2 6, G3 3, G13 4, G18 2, PG-wire 1).

### 1.2 The throwing frame (G2, G13, G18, PG-wire G12) [X]

Executed twice independently: the coordinator's other track (guard-witness-r8, cf36aeae3) and this probe
(b07094a76, `lr-probe-b07094a76-1`). Identical inner frame in all four captured paths (heartbeat endpoint
INSERT, SERVICES row UPDATE, service_instances UPDATE, service_definitions UPDATE for the PG-wire route):

```
Error: Cannot read properties of undefined (reading 'partitionId')
    at rememberWriteReceipt (src/control-plane/control-plane-write-identity.js:238:21)
    at observedWriteResult (.../control-plane-write-identity.js:442:20)
    at runNamedControlPlaneWrite (.../control-plane-write-identity.js:435:10)
    at async ControlPlaneSystemTableGateway.submitMutation / executeMutationWithDiagnostics (...)
    ... (heartbeat: attemptWrite <- attemptNamedEndpointWrite <- writeEndpointAtIncarnation <-
         HeartbeatService.writeNodeEndpointAtIncarnation <- sendHeartbeat;
         SERVICES: runRetryableControlPlaneWrite <- ServicesOwner.executeMutation <-
         updateRuntimeReplicaServicesRow <- projectRuntimeReplicaServicesRow)
  [cause]: TypeError: Cannot read properties of undefined (reading 'partitionId')
      at belongsToNamedWrite (src/control-plane/control-plane-named-write-outcome.js:30:25)
      at isCommittedPartitionSuccess (.../control-plane-named-write-outcome.js:38:52)
      at judgePartitionAnswer (.../control-plane-named-write-outcome.js:65:7)
      at judgeNamedWriteOutcome (.../control-plane-named-write-outcome.js:126:10)
      at judgeNamedWriteOutcome (.../control-plane-named-write-outcome.js:123:12)   <- recursion into partitionResult
      at settleInstance (src/control-plane/control-plane-write-identity.js:250:35)
      at .../control-plane-write-identity.js:286:7                                  <- beginDelivery continuation
```

The undefined value is `witness` (`result.durableCommitWitness`, :36). The guard at :38,
`witness?.partitionId === result.partitionId`, is `undefined === undefined` when the judged answer carries
neither a witness nor a top-level `partitionId`, and `belongsToNamedWrite(witness, attempt)` then reads
`undefined.partitionId`. The judged answer is the fake engine's `{success:true, affectedRows:n}`, wrapped by
the REAL `CDCIntegrationService` as `{success:true, committed:true, partitionResult:<fake>}`; :123 recurses
into `partitionResult`. The TypeError is caught by `beginDelivery` (:288), settled UNKNOWN
(record.unresolved), and rethrown to the caller as an Error whose message is the TypeError's. Beat 2 of the
heartbeat witness shows the consequence: the next write of the name must first re-deliver the held instance
(`resolvePendingInstance`, :411), which throws the same TypeError again, so the held instance can never be
resolved by re-drive, only by readback or release.

Surfaces: register-service 500 (`register-service-move-handoff-refused`), `SERVICES_ROW_PROJECTION_FAILED`
-> `PUBLISHED_UNPROJECTED` (service-runtime-consensus-publication; the wasm bound-* founders of G13 never
reach `RUNTIME_SERVICE_CREATE_ACTIVE` for the same reason, captured `G13-services-row-threw`), `beat N does
not fail` (heartbeat-liveness), `Failed to persist operation` (replica_operations, the guard witness), PG-wire
scale 500 with body `{"success":false,"outcome":"failed","errorCode":null,"error":"Cannot read properties of
undefined (reading 'partitionId')"}` (captured `G12-pgwire-body`), and G18's `UNKNOWN`: the service-instance
owner swallows the thrown TypeError (`catch {submitted = null}`) into `SUBMISSION.UNKNOWN`
(`service-instance-metadata.js:64-77`), so a lost CAS (0 rows) that main answered `STATE_CHANGED`/`CLOSED`
is now `UNKNOWN` (captured `G18-A6-update-threw`).

### 1.3 The unknown without a throw (G1, G3) [X]

Fakes answering at the CDC level with `{success:true}` (registration mocks) or `insertViaUpsert`'s
`{success:true, partitionResult:{affectedRows:1}}` (no `committed:true`) are not recursed into and fail
`hasAffectedRows` before the witness test, so they are judged UNKNOWN without a throw:

- G1 (captured `G1-registration`, node-registration-idempotency): `Failed to register node: The proposal was
  accepted into consensus and its outcome is not known ...` from `wrapNodeRegistrationError`
  (`node-registration-owner.js:106`) <- `failedResultError` (`node-registration-incarnation-write.js:422`) <-
  `attempt` (:396) <- `writeNodeRegistrationAtIncarnation` (:594) <- `registerJoinNodeRow`; inner answer
  `failureCode:'partition_write_outcome_unknown', deferRetry:true, pendingInstance:{writeIdentity:
  '["nodes","test-node-idempotent",1,"birth"]', outcome:'unknown'}`. The mock saw the NODES birth twice (first
  attempt + re-drive under the same key) and never reached the endpoint write.
- G3 (captured `G3-*`, heartbeat-memory-trend): each beat's endpoint INSERT answers
  `success:false, failureCode:'partition_write_outcome_unknown', pendingInstance.outcome:'unknown'`; the
  readback `readAuthoritativeRows` answers `authoritative_read_owner_unavailable` (the mock has no authority);
  `writeNodeEndpointAtIncarnation` returns null; `lastEndpointUpsertAt` is not stamped; the next beat upserts
  again. Four beats, four upserts.

### 1.4 Verdict table over the real producers (coordinator follow-up) [X]

Probe 939b8c7b4 (`lr-verdict-939b8c7b4-1`): named writes (`writeIdentity`) issued through the real chain of
`test/query/unknown-outcome-surface-fixture.js` `withSurface` (a lone rs-raft WASM leader `PartitionService`
for `storage_reservations-p1`, real `SQLQueryEngine`, `QueryExecutor`, distributed write coordinator,
`CDCIntegrationService`, control-plane gateway), each answer captured where the gateway receives it and
judged with the real `judgeNamedWriteOutcome` against the route partition `storage_reservations-p1`
(= `INITIAL_PARTITION_IDS`). "caller" is what the gateway returned to the owner.

| Path (production meaning) | Judged answer shape | top `partitionId` | top witness | Participant / nested receipt | Verdict | Caller |
|---|---|---|---|---|---|---|
| SQL gateway INSERT (joiner startup SQL) | engine result with `participantResults` | none | none | 1 participant: `partitionId` set by the coordinator, witness on `storage_reservations-p1`, entry `dwrite-participant-...` (derived from the key) | APPLIED | success |
| SQL gateway UPDATE | same | none | none | same | APPLIED | success |
| Explicit key, first delivery | same | none | none | same | APPLIED | success |
| Explicit key, re-delivery of the settled entry (replay answer) | same | none | none | participant still carries the original witness (same entryId) | APPLIED | success |
| CDC through the engine, INSERT (node not leading the partition) | `{success, committed:true, partitionResult:<engine result>}` | none | none | `partitionResult.participantResults[0]` with partition + witness | APPLIED | success |
| CDC through the engine, UPDATE | same | none | none | same | APPLIED | success |
| CDC local leader, INSERT (node leads the partition) | `{success, committed:true, partitionResult:<partition answer>}` | none | none | `partitionResult.partitionId` + witness, entry derived from the key | APPLIED | success |
| CDC local leader, UPDATE | same | none | none | same | APPLIED | success |
| CDC bootstrap direct, INSERT (seed registration window) | `{success, committed:true, partitionResult:<partition answer>}` | none | none | `partitionResult.partitionId` + witness, but `witness.entryId` = random UUID `63073069-...`: the bootstrap lane calls `raftLaneService.executeQuery(sql, params)` without the key (`cdc-bootstrap-direct-sql.js`) | UNKNOWN | `success:false`, "outcome is not known", pending instance unknown, although the row applied |
| Fixture `{success:true}` | hand-built | none | none | none | UNKNOWN | (G1) |
| Fixture `{success:true, committed:true, partitionResult:{affectedRows:1}}` (`insertViaUpsert` without committed is also UNKNOWN) | hand-built | none | none | none | UNKNOWN | (G3) |
| Fixture `{success:true, affectedRows:1}` | hand-built | none | none | none | THROWS TypeError | (G2) |
| Fixture `{success:true, committed:true, partitionResult:{success:true, affectedRows:1}}` (engine fake behind the real CDC) | hand-built | none | none | none | THROWS TypeError | (G2, G12, G13, G18) |
| Fixture `{success:true, affectedRows:1, partitionResult:{affectedRows:1}}` (heartbeat-liveness engine fake) | hand-built | none | none | none | THROWS TypeError | (G2) |

Findings on the other track's claims:
- Claim (1) "production engine answers have no top-level partitionId, so a witness-less success throws in
  production too": the first half is TRUE, the conclusion is REFUTED. Every real engine answer carries
  `participantResults`, so the judge takes `judgeDistributedAnswer`; each participant carries `partitionId`
  (added by `executePlanParticipants`, `distributed-write-coordinator.js:239-262`), so a witness-less
  participant would be UNKNOWN (`undefined === 'x-p1'` is false), never a throw. The local-leader and
  bootstrap answers are partition answers that always carry `partitionId`
  (`partition-service-entry-apply-base.js:641-662`). No real-producer row throws.
- Claim (2) "with a witness, :38 compares `witness.partitionId === undefined`, so the engine path never
  settles APPLIED": REFUTED by execution: on the engine and CDC paths :38 is evaluated on the participant or
  the nested partition answer, which carry `partitionId`; all eight real engine/CDC rows are APPLIED. The
  only real path that does not settle is the bootstrap-direct lane, for a different reason (entry not
  derived from the key).
- What throws: an answer that is `success:true` with a valid count, no `participantResults`, no witness and
  no `partitionId` at the judged level. Only the fakes produce that.
- New sibling found by execution (product, production path): the CDC bootstrap-direct lane drops the
  write's idempotency key, so a named write in the seed's bootstrap window is never APPLIED by its answer and
  a re-delivery would be a NEW entry (R14). Whether any NAMED gateway write runs while CDC is in bootstrap
  mode in production is not established: the seed's bootstrap writes go through `SystemTableWriter` straight
  to the CDC service (not through `runControlPlaneWrite`) [R]; not determined beyond that.

### 1.5 Classification

- **INTENDED CONTRACT CHANGE whose test fakes were not migrated** (the bulk of G1, G2, G3, G13, G18 and the
  PG-wire file of G12): 7d261f681 made the producer's durable commit receipt the only proof of an applied
  named write (decision: fresh-formation-user-table-routability log lines 370/382). Every red file in these
  groups builds an engine/CDC fake that never answers with a receipt; production never builds those fakes.
- **PRODUCT DEFECT inside the new judge** (R07, R11): `isCommittedPartitionSuccess` dereferences a missing
  witness when the answer lacks both `durableCommitWitness` and `partitionId`. The judge must be total: such
  an answer is a typed UNKNOWN, never a TypeError. Today the TypeError is settled UNKNOWN internally, but the
  caller receives a generic Error, so owners that classify by type see a plain failure (HTTP 500,
  SERVICES_ROW_PROJECTION_FAILED, "Failed to persist operation" for an INSERT that applied, the guard
  witness's "acknowledged write reported as failed"), and a held instance cannot be re-driven to settlement.
  Production reachability: no real producer reaches the throw (1.4: every engine, CDC-engine and CDC-local answer is APPLIED); it is reached by any answer that lacks `participantResults`, witness and `partitionId` together, which today only the fakes produce. It is still a product defect: the judge is the owner of the outcome and must classify every input (R07), and a future producer or adapter that drops the fields would turn applied writes into thrown failures.
- **Sibling product defect captured by execution**: `unresolvedAnswer` (`control-plane-write-identity.js:351`)
  spreads the gateway's normalized answer, so the UNKNOWN answer carries `success:false,
  failureCode:'partition_write_outcome_unknown'` next to the gateway's `outcome:'applied',
  completionState:'applied', contractState:'ready', nextAction:'proceed'` (captured in `G1-registration` and
  `G3-insertSystemTableRow-answer`). Two interpretations in one answer (R08): a consumer that reads
  `outcome`/`completionState`/`nextAction` alone sees "applied, proceed".

### 1.6 Siblings [R]

`git grep -n "?\.partitionId ===\|?\.entryId ===" 23344cddc -- src` within the named-write and outcome code:
- `control-plane-named-write-outcome.js:38` - the defect.
- `control-plane-named-write-outcome.js:69` - `nested?.partitionId === result.partitionId ? nested : result`:
  double-undefined selects the nested failure; it does not throw unless `participantFailures` holds a
  non-object (then `isCommittedPartitionFailure(undefined)` reads `.committed`). Same unguarded family.
- `cdc-routed-mutation-readiness.js:213` - `result?.entryId === legIdentity.entryId` is already guarded by
  `typeof legIdentity.entryId === 'string'`; not a sibling.
- `control-plane-authoritative-read-witness.js:7`, `cdc-integration-service-local-system-table-routing.js:115`
  - both guard the right-hand side (`state === 'observed'` / `!canonicalPartitionId` earlier); not siblings.
- `node/replica-cleanup-tombstone-owner.js:107` - `authority?.partitionId === scope.partitionId && ...`
  double-undefined passes if `scope` lacks the fields; outside the named-write code, not exercised here
  (recorded, not examined further).
Other callers that classify a thrown named-write error by message or swallow it (each turns the defect into
a generic failure): `projectServicesRow` (`service-runtime-consensus-publication.js:56-63`), `submitState`
(`service-instance-metadata.js:64-71`), `buildOperationPersistError` (replica_operations), the
register-service handler (500), the admin owner route (500).
Fixtures with the receipt-less shape (all will stay red after a judge fix, as UNKNOWN instead of a throw):
`createCreationSqliteFixture` (used by 14 test files incl. the wasm bound-*, runtime-service, service-instance
files), `insertViaUpsert`/`createMockCdc` (70 files reference them), and every engine fake returning
`{success:true, affectedRows}` behind a real `CDCIntegrationService`.

### 1.7 Real cluster

GCP run 1 and run 2 node-log archives at f580579a5 (`archives/*.tar.zst`, decompressed and grepped):
0 x `reading 'partitionId'`, 0 x "Failed to register node", 0 x `placement_admission_bytes_invalid`; 283 and
659 x `partition_write_outcome_unknown`, all of them genuine transport unknowns from the producer (e.g.
`"error":"Message timeout"`, `"lastObservedState":{"state":"answer_lost_after_delivery"}` on `nodes-p1`
UPDATEs), not the judge's. The formations' writes travel the real producers, which emit the receipt (1.4).

### 1.8 History

`git grep -n "reading 'partitionId'" 23344cddc -- solve docs`: nothing. The settlement change itself is
recorded (1.1); its consumers' fakes are not.

### 1.9 Proposed repair and witness (not implemented)

Make `judgeNamedWriteOutcome` total: APPLIED only when a witness object is present AND its `partitionId`
equals the attempt's declared partition (`attempt.partitionId`, not the answer's possibly-absent own field)
AND it is bound to the named entry (or the single primary participant of a complete distributed answer
satisfies the same); FAILED / NOT_PROPOSED as today; every other shape, including a malformed one, UNKNOWN
(no field read on an absent object). Keep `unresolvedAnswer` from carrying the gateway's `applied` fields.
Then migrate the fakes to answer like the producer (or compose the real producer as
`test/query/unknown-outcome-surface-fixture.js` does). Witness: the existing red files (G1 7, G2 6 + the
guard anchor, G3 3 of 4, G13 4, G18 2, PG-wire 1) are sufficient for the fixture migration but NOT for the
judge: after a judge-only fix they stay red as UNKNOWN, so the judge needs its own unit witness (the shapes
of 1.4, hand-built and real, including "success without witness and without partitionId -> UNKNOWN, no
throw"). A production-composition witness exists in substance: `test/query/named-write-verdict-table-probe.test.js` at 939b8c7b4 (probe only) shows APPLIED on every real engine/CDC path; a landed form of it is missing.

The contract the repair must implement: a named control-plane write is APPLIED only on proof bound to its
own entry and declared target partition (the producer's durable commit witness for that entryId on that
partition, or the owner's authoritative read-back that captured the exact retained effect via
`captureControlPlaneWriteConfirmation`); FAILED only on a committed statement failure bound to that entry;
NOT_PROPOSED only on a pre-proposal refusal on that partition. Every other answer is a typed UNKNOWN that
names the pending instance and is owned by (a) re-delivery under the same key by the next attempt, (b) the
owner's authoritative read-back, or (c) release by the owning authority; never a thrown TypeError and never
an assumed success.

## 2. G1 / G18 specifics: where UNKNOWN becomes a failure, and the owned continuation

- **Where** [R]+[X]: `writeNodeRegistrationAtIncarnation` (`node-registration-incarnation-write.js:563-608`)
  classifies the attempt indeterminate (`isRegistrationAttemptIndeterminate`: the answer is a named unknown),
  records an indeterminate issue (BLIND_BIRTH without authority, AUTHORITATIVE with it), rereads, may replay
  the birth under the same write identity, and returns `UNRESOLVED` with the attempt's error;
  `registerJoinNodeRow` (`node-registration-owner-durable-rejoin-methods.js:401-433`) throws that error, and
  `wrapNodeRegistrationError` (`node-registration-owner.js:105`) re-wraps it as "Failed to register node: ..."
  keeping `deferRetry`/`retryable`. The join's retry loop ("Retrying join admission system-table write")
  re-enters with the issue record, which resolves by read-back or by the replayed birth under the same entry.
- **Before the line**: the outcome was not resolved by read-back or retry at all in these fixtures: a bare
  `{success:true}` was SETTLED by `judgeAttempt` and registration was ACCEPTED immediately.
- **Now**: an explicit state (UNRESOLVED + indeterminate issue record + `deferRetry` error naming the pending
  instance) with an owned continuation (re-drive under the same key, authoritative read-back, the join retry).
  This satisfies "never silent, never assumed". The fixture can never leave it because its mock has no
  authoritative read and never answers with a receipt. Classification: **FIXTURE debt of the 7d261f681
  contract change**; no product defect in the registration owner was found. `executor-bypasses-workflow-owner`
  (the 7th G1 file, "Failed to persist operation") is the replica_operations instance of 1.2 (read, not
  probed).
- **G18** [X]: the service-instance owner has no read-back after a thrown write: the TypeError lands in
  `catch {submitted = null}` -> `SUBMISSION.UNKNOWN` -> one `readState`; the fixture's read resolves nothing
  for a lost CAS, so `{outcome: 'UNKNOWN'}`. With the judge fixed and the fake migrated the 0-row answer is
  again a definitive NOT_APPLIED (FAILED/committed zero) and A6 answers STATE_CHANGED. Classification:
  FIXTURE + the 1.2 defect. Siblings: `service-instance-selection-admission` (same fixture), every
  `createCreationSqliteFixture` consumer.

## 3. G3: heartbeat endpoint writes are not "no longer coalesced"

- **Was coalescing removed on purpose?** No. The one owner deciding whether an endpoint write is needed is
  unchanged: `shouldUpsertEndpointRow` (`heartbeat-service-write-coalescing.js:279-293`, refresh interval
  `endpointRefreshIntervalMs`, default 300000 ms), fed by `lastEndpointUpsertAt`/`lastEndpointUpsertSignature`,
  which `heartbeat-service-publication-methods.js:287-288` stamps only after `writeNodeEndpointAtIncarnation`
  returns a completed outcome (diff 49495f7e4..23344cddc of that block: none) [R].
- **What changed** [X]: the endpoint write's outcome. With the 1.1 rule the fake's answer is UNKNOWN, the
  read-back is unavailable, the outcome is not completed, the stamp is not written, and the next beat
  correctly re-drives the same named instance. Tests' own counts: heartbeat-memory-trend 3 upserts in 20 ms
  instead of 1 per 100 ms window; heartbeat-periodic-writes 4 instead of 1 per burst; i.e. one endpoint write
  per beat instead of one per refresh interval. In production defaults that would be 1 per 5 s (beat =
  ready-lease 15000/3) instead of 1 per 300 s, but only if the production answer is UNKNOWN; with the
  receipt the real producers emit (1.4) the outcome is APPLIED and the rate is unchanged.
- `heartbeat-storage-budget-preservation` is a pure contract-shape pin: since 8540d6b7a ("Confirm only the
  observed endpoint write instance after readback", 09:38) the endpoint authority passes
  `{writeIdentity, confirmWriteEffect}` (`endpoint-incarnation-authority.js:242`) and the test deep-equals the
  write options without `confirmWriteEffect`: **CONTRACT CHANGE, test not migrated** [R].
- `heartbeat-memory-trend-reporter-and-shutdown` (1 vs 2 authoritative reads) [I]: the extra read is the
  endpoint authority's read-back after the UNKNOWN write (captured in memory-trend as one
  `readAuthoritativeRows` per beat); not probed in this file.
- Classification: **FIXTURE debt of 7d261f681** (three files) + **stale contract pin of 8540d6b7a** (one);
  no product change to coalescing. Witness: the four files after migration; a production-composition
  witness of "one endpoint write per refresh interval on the real producer" does not exist (missing).

## 4. G12

### 4.1 PG-wire scale route 500 [X]
`G12-pgwire-update-threw` + body above: section 1.2, same frame, via `ServiceDefinitionsOwner` ->
gateway UPDATE on `service_definitions` with the fake engine `{success:true, affectedRows}`. FIXTURE debt +
the 1.2 judge defect; the operator route on a real cluster gets the receipt (1.4).

### 4.2 CREATE TABLE below quorum "loses its error" [X]
Capture `G12-quorum-rejected`: the provisioning rejects with an Error whose message is EMPTY, `code:'TIMEOUT'`,
`timeoutClassification:{classification:'absolute_deadline_exhausted', configuredBudgetMs:10, remainingBudgetMs:0,
nestedOperation:'partition_provisioning'}`, thrown by `assertProvisioningAttemptBudget`
(`sql-query-engine-provisioning-admission-methods.js:289`) <- `readProvisioningTargetAdmission` (:304) <-
`probeProvisioningTargetAdmission` (:388) <- `waitForProvisionTargetNodeIds` <- `provisionInitialTablePartition`
(:200); `checkProvisioningAdmission` was never called (`checkedTargetNodeIds: []`). Two causes, both from
73fbf0576 ("fix(query): fence provisioning width and attempt deadline at founding", 2026-11-21 03:33):
- **PRODUCT DEFECT (R06)**: the hunk added
  ```
  +    const error = createTimeoutBudgetError({
  +      message: QUERY_ERROR_MSG.TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT,
  ```
  but that key exists only on `QUERY_LOG_MSG` (`query-constants.js:339`), so the message is `undefined` and
  every exhausted provisioning attempt deadline surfaces as an empty error. Reachable in production: any
  CREATE TABLE / split / founding provisioning whose attempt deadline is spent before or between admission
  reads (PG-wire clients see an empty error text with code TIMEOUT).
- **INTENDED CONTRACT CHANGE, test not migrated**: the per-attempt deadline fence now precedes each admission
  read; the test configures `tablePartitionProvisioningTimeoutMs: 10`, which on the lab is spent before the
  first read, so the test no longer reaches the insufficient-targets rejection it pins.
- Repair: take the message from `QUERY_ERROR_MSG` (add the error message there) and give the test a budget
  that covers its reads (or a controlled clock). Witness: `sql-query-engine-create-table-quorum` (sufficient
  for the test part); the empty message needs its own assertion on the deadline path (missing).

### 4.3 Seed bootstrap register-service 500 [X]
Capture: `{"statusCode":500,"error":"Internal Server Error","message":"ControlPlaneSystemTableGateway requires
cdcIntegrationService"} sqlCalls=0`. 7d261f681 removed `shouldUseSqlMutationFallback` /
`executeSqlMutationFallback` (the phase-scoped SQL path a node without a CDC owner used; decided into its
phaseScope-only form on 2026-11-02, replica-admission-from-committed-operation log line 27) and replaced it by
`executesStartupSql`, active only when the gateway is built with `startupSqlMutationPhase`, which only the
joiner's join-admission gateway sets (`node-registration-owner-publication-methods.js:381`). BootstrapAPI's
gateway never has it, so a register-service before CDC is wired throws `CDC_REQUIRED` (`deferRetry:true`)
and the route answers 500 [R]. Production composition: the seed hydrates `cdcIntegrationService` into
BootstrapAPI (`lagrange-runtime-startup.js:486-498`) BEFORE `bootstrapAPI.initialize()` opens HTTP (:510), so
the seed cannot serve register-service without CDC; the joiner's BootstrapAPI is initialized (:198) before its
join completes and resolves CDC lazily through `runtimeOwner` [R]. Classification: **INTENDED CONTRACT CHANGE
(the fallback is gone), test stands on a removed path** for the seed; sibling product gap: a `deferRetry`
gateway refusal is answered as HTTP 500 instead of a retryable status (the joiner window could reach it [I]).
No record names the removal of this fallback or the bootstrap-api case; the owner rules whether the fallback
stays removed.

## 5. G19 `placement_admission_bytes_invalid` for replica_operations-p1 [X]

Capture `G19-createOperation`: thrown by `throwRuntimeServicePlacementError`
(`rebalance-coordinator-operation-creation-support.js:198`) from `createPartitionOperationViaPlacementAdmission`
(:527) with `admissionAnswer: null` and `placementResult:{reason:'placement_admission_bytes_invalid'}`; the
probe's wrap of `submitPlacementPayload` recorded nothing, so the refusal is coordinator-side, before any
payload reaches the ledger. Code (blame): introduced by the merge commit 268d439b2 ("Compose native placement
epoch and entry binding with reviewed reentry fixtures", 2026-11-21 00:44; lines new against both parents):

```
++    const requestsPhysicalReplica =
++      (normalizedMoveType === OperationType.ADD && move.replicaId) ||
++      (normalizedMoveType === OperationType.REPLACE && move.sourceReplicaId && move.replicaId);
++    if (requestsPhysicalReplica) {
++      throwRuntimeServicePlacementError(partitionId, null, {
++        reason: PLACEMENT_ADMISSION_ERROR.BYTES,
++      });
```

The test asks `createOperation({type:'ADD', partitionId, nodeId, replicaId: 'replica-node-target-dispatch-...'})`;
under placement admission a partition ADD's replica identity is derived at apply (the statement requires
`replicaId: null` for a PLACEMENT ADD, `replica-placement-owner-admission-statement.js` `isMoveShapeValid`).
Production callers: the provisioner's `buildProvisioningCreateOperationMove` passes no replicaId; the unified
rebalancer passes `move.replicaId` through (`unified-rebalancer-move-execution.js:62`); GCP node logs: 0 x
`placement_admission_bytes_invalid`. Classification: **INTENDED CONTRACT CHANGE, test not migrated**, with a
naming defect: a request-shape refusal at the coordinator reuses the partition's committed-bytes code
(`placement_admission_bytes_invalid`), so it reads like corrupt command bytes (R07: name the state, e.g.
"explicit replica identity not admitted for a placement ADD"). Sibling to check before repair: whether any
unified-rebalancer partition ADD/REPLACE move can carry `replicaId` when placement admission is enabled
(read, not determined). Repair: drop `replicaId` from the test's request (or assert the refusal), give the
refusal its own code. Witness: `control-plane-rebalance.integration` (sufficient for the test); the unified
rebalancer question needs a read or a witness (missing).

## 6. Could not determine

- Whether any NAMED gateway write runs while the CDC service is in bootstrap mode in production (the
  bootstrap-direct lane judged UNKNOWN in 1.4). Seed bootstrap writes go through `SystemTableWriter`, not the
  named path [R]; no execution covers the seed's bootstrap window.
- Whether a unified-rebalancer partition ADD/REPLACE move can carry `replicaId` when placement admission is
  enabled (G19); GCP logs show 0 refusals.
- `heartbeat-memory-trend-reporter-and-shutdown` (G3, 1 vs 2 authoritative reads) and four of the six G2 files
  (`runtime-access-settled-replay-projection`, `register-service-move-handoff-refused`,
  `placement-admission-cross-coordinator-target-census`, `replica-placement-owner-core`) and G13's other three
  files were not probed; their retained messages carry the same signature and they use the fakes listed in
  1.6 [I].
- G12's other files (terminal-removal 409->500, log-marker, node-join-replica-activation,
  move-replica-assignment-token) were outside this brief and were not examined.
- `node/replica-cleanup-tombstone-owner.js:107` double-undefined comparison: recorded, not examined.
- Intermittency: one probe run per file.

---

# Stage 2: product repairs (red-first), 2026-11-21 ~16:30-17:45Z

Branch `work/line-regression-causes-20261121` (pushed): 0ddf7b00f282145cedf64db14360b5c5120de926 (witnesses
only, red) -> ab3e4b9af19fc68c5b6b74b24042aee91bd77a3e (repairs). Both through heavy.sh; lab only (adam-laptop).
Scope kept: `control-plane-named-write-outcome.js`, `control-plane-write-identity.js`, `query-constants.js`
+ its one caller, `bootstrap-api-control-plane-methods.js`; new test files only; no existing assertion touched.

## Lab runs

| Run | Sha | Result | Directory under `lab/` |
|---|---|---|---|
| Red-before: 5 new witnesses | 0ddf7b00f | 4 red for the intended reasons, 1 green (the real-producer guard) | `lr-s2-red-0ddf7b00f-1/` |
| Guards before: 8 existing named-write files | 0ddf7b00f | 7 green; `write-exactly-once-property` already red ("A named control-plane write requires a declared system partition", d471620a9's scope check on a user table) | `lr-s2-guards-before-0ddf7b00f-1/` |
| After: witnesses + 10 representative red files + 8 guards | ab3e4b9af | 13/23 green; details below | `lr-s2-after-ab3e4b9af-1/` |

## Item 1: the named-write judge is total [X]

- Repair (`control-plane-named-write-outcome.js`): `isRecord`/`isDeclaredAttempt` guards; every comparison
  requires presence first. APPLIED only when `durableCommitWitness` is an object, the answer has a
  `partitionId`, the witness names that partition, it equals the attempt's declared partition, and
  `witness.entryId === deriveParticipantEntryId(attempt.key, partition)`. The double-undefined class fixed at
  :38 (witness vs answer partition), :69 (single nested failure selection, now `singlePartitionFailureOf`),
  the distributed key comparison (`result.idempotencyKey !== attempt.key` passed with both absent), and
  non-object participants / nested failures / attempts. `git grep` of the two files found no other
  optional-chain comparison (`control-plane-write-identity.js:489` compares to a constant).
- Witness `test/control-plane/named-write-outcome-total.test.js`: 31-shape table. Red at 0ddf7b00f:
  3 shapes threw `TypeError ... reading 'partitionId'` (the exact receipt-less success, the engine fake
  behind the real CDC service, the heartbeat fake), 1 threw `reading 'committed'` (nested `[null]`), 1 threw
  on a missing attempt, and "distributed answer and attempt both without a key" was APPLIED. Green at
  ab3e4b9af. The gateway + real `CDCIntegrationService` case (production construction, the shape that threw)
  now returns the typed unknown twice (the held instance re-delivered under its own key) instead of throwing.
- Guard `test/query/named-write-real-producer-applied.test.js` (real rs-raft leader, engine, coordinator, CDC,
  gateway): green before and after on the SQL gateway, CDC-through-engine and CDC-local-leader paths.
- Guards green after: control-plane-write-identity, endpoint-incarnation-authority,
  control-plane-error-classification, coordinator-reservation-lifecycle, durable-rejoin-incarnation-advance,
  write-identity-instance, membership-publication-native-ack-order; write-exactly-once-property unchanged red.

## Item 2: an unknown answer never says "applied" [X]

- Built in `unresolvedAnswer` (`control-plane-write-identity.js:351`), which spread the gateway-normalized
  transport answer. Repair: the transport classification (`outcome`, `completionState`) no longer travels;
  the one unknown shape is `success:false, deferRetry:true, failureCode:'partition_write_outcome_unknown',
  pendingInstance{outcome:'unknown'}, contractState:'pending', nextAction:'retry'` (accepted into consensus,
  not proven; owned next action = re-send under the same key; read-back stays the owner's).
- Witness: named-write-outcome-total case 2 (red: `outcome:'applied'`; green after) and case 3 (through the
  gateway and the real CDC service).
- Consumer census (readers of `outcome`/`completionState`/`contractState`/`nextAction` of a named-write answer,
  or of the classifier's `known`/`outcome`/`accepted`, which derive from `outcome`):
  - `classifyControlPlaneMutationResult` (control-plane-mutation-outcome-classifier.js): stale `applied` +
    `success:false` gave `known:true, outcome:'applied', accepted:true` but `applied:false` (`failed` gates only
    `applied`). Consumers that decide on `.applied`/`success` were safe: registration `attempt()`
    (node-registration-incarnation-write.js ~:389-399), endpoint authority `attemptApplied` and
    `mutateEndpointAtIncarnation` (:216-219), service-registration-handoff-owner.js:607,
    control-plane-single-row-confirmation.js:16-25 (checks `failed` first), postgres-wire-scale-contract.js:72
    and nodes-owner.js:103 (`!effect.failed`).
  - authoritative-row-mutation-vocabulary.js:98-118: a known `applied` that is not applied maps to REJECTED
    (identical to an absent outcome); the helper schedules a retry. Not acted on as applied.
  - node-registration-owner-publication-methods.js:136-203 (`classifyJoinAdmissionMutationAcceptance`, join
    withdrawal): reads `mutation.accepted` (not gated by `failed`) and `contractState`/`nextAction`; the stale
    answer gave `accepted:true, success:false, withdrawalDeferred:true`. After the repair the same report comes
    from the declared pending contract (`pending`+`retry`). Not acted on as applied.
  - system-metadata-owner-base.js:102-104 copies `outcome` onto the owner error; the admin route
    (admin-owner-operations.js:165-174) answered 503 by `deferRetry` with `mutationOutcome:'applied'` in the body.
  - gateway ledger/telemetry (`executeMutationWithDiagnostics`, mutation-submission.js:418-436) recorded
    `outcome:'applied'` with `success:false` for every unknown named write (diagnostic only).
  - heartbeat `shouldTreatEndpointHeartbeatWriteAsDeferred` (publication-methods.js:80-90): decides on
    `deferRetry` first; unchanged.
  - **No consumer acted on the stale "applied" as an acknowledged write: no safety finding.** Residual for the
    classifier's owner: `accepted`/`known` are not gated by `failed` for a known outcome; with the repair no
    named-write answer carries a contradictory outcome any more.
- Handed to the owner of the mutation-outcome vocabulary (not edited, outside scope):
  `CONTROL_PLANE_MUTATION_OUTCOME` (control-plane-system-table-gateway-constants.js:136) has no member for an
  unproven write; adding `UNKNOWN: 'unknown'` with a classifier row `{applied:false, accepted:true,
  deferred:true, retryable:true, terminal:false}` would let the unknown answer carry a named outcome instead of
  none.

## Item 3: the CDC bootstrap-direct window [R]

- Window: `systemTableWriter.enable()` (seed-registration-phase.js:126, CDC bootstrap mode on) until
  `d.swapSystemTableWriter()` (seed-cache-hydration-phase.js:278, `currentWriter.disable()` at
  seed-registration-phase.js:729).
- Writes issued inside it: registerMessageGroup, registerServices, registerMetaServiceDefinitions,
  registerSystemTables, updatePartitionSizes, persistCurrentEpochIfMissing, persistClusterIdIfMissing,
  persistFormationDeclarationIfMissing, all through `BootstrapSystemTableWriter` straight to
  `cdcIntegrationService.insert/upsert/updateSystemTableRow` (system-table-writer.js:28-50), never through
  `runControlPlaneWrite`; seedDynamicConfiguration (seed-registration-phase.js:502-560) through a gateway
  `insertSystemTableRow` WITHOUT `writeIdentity` (dynamic-config-service.js:187-198), so unnamed; the latency
  owners started in hydration write unnamed (latency-measurement-service.js:552-574); heartbeat and the
  registration owners start after bootstrap (lagrange-runtime-startup.js). **By reading, no named write runs
  in the window**, so no repair was made.
- The key-dropping lane is NOT dead code: it carries every bootstrap-window write. What it drops is the
  idempotency key (`executeBootstrapDirectSql(service, sql, params)` passes no options to
  `raftLaneService.executeQuery`), so a keyed retry inside the window is a new entry (R14). Recommended edit for
  its owner (not made): carry `idempotencyKey` and the derived `entryId` into the raft lane, or refuse a named
  write while bootstrap mode is on. Not deleted.

## Item 4: the empty provisioning-deadline error [X]

- Repair: `QUERY_ERROR_MSG.TABLE_PARTITION_PROVISION_DEADLINE_EXHAUSTED` ('Table partition provisioning
  deadline exhausted before target admission') used by `assertProvisioningAttemptBudget`
  (sql-query-engine-provisioning-admission-methods.js:290).
- Census of `QUERY_ERROR_MSG.<NAME>` under src/query (static; also a test): 3 undefined members, all fixed at the
  owner (query-constants.js `QUERY_ERROR_MSG`): `TABLE_PARTITION_TARGET_NODE_WAIT_TIMEOUT` (provisioning, above),
  `PRIMARY_KEY_REQUIRED` (distributed-write-coordinator.js:505, an INSERT row that does not route to one
  partition threw an empty Error), `QUERY_EXECUTION_FAILED` (sql-query-engine-write-failure-methods.js:284,
  the fallback text of a tracked write failure was undefined). Texts are distinct from the log vocabulary.
  The other `*_MSG` tables referenced under src/query resolved (LOCKING_ERROR_MSG is local to
  sql-locking-read-grammar.js and complete).
- Witness `test/query/provisioning-deadline-error-message.test.js`: unit on the real
  `assertProvisioningAttemptBudget`, the CREATE TABLE provisioning path with an exhausted deadline (no
  admission read spent), and the census. Red (message `""`, 3 missing members), green after.
- Fixture debt (not edited): `test/query/sql-query-engine-create-table-quorum.test.js` sets
  `tablePartitionProvisioningTimeoutMs: 10`; after the repair it rejects with the named deadline message
  instead of `""`, still not `/insufficient/`.

## Item 5: retryable refusal answered as 500 [X]

- Cause: `buildBootstrapControlPlaneMutationError` (bootstrap-api-control-plane-methods.js:351) rebuilt the
  error without `deferRetry`, so the one retryable mapping (`isRetryableBootstrapControlPlaneQueryFailure` ->
  503 typed error) never saw it. Repair: carry `deferRetry`. The pre-CDC SQL fallback stays removed.
- Witness `test/bootstrap/register-service-retryable-refusal.test.js` (real BootstrapAPI route): red (500
  "ControlPlaneSystemTableGateway requires cdcIntegrationService"), green after (503, typed code, retry hint,
  non-terminal handoff contract, 0 SQL calls).
- PG-wire scale 500 (G12) was NOT this gap: the admin route already maps `deferRetry` to 503; its 500 was the
  item-1 TypeError (no `deferRetry`, no code). After the repair it answers 503 owner_not_ready.

## Item 6: misleading refusal code (witness only; edit handed over) [X]

- Witness `test/rebalancer/placement-explicit-replica-refusal-code.test.js` (real
  `createPartitionOperationViaPlacementAdmission`): red before and after (code
  `placement_admission_bytes_invalid` for ADD with `replicaId` and REPLACE with both replicas).
- Exact edit for the merger:
  1. `src/partition/partition-placement-admission-constants.js`, `PLACEMENT_ADMISSION_ERROR`: add
     `REPLICA_IDENTITY_NOT_ADMITTED: 'placement_admission_replica_identity_not_admitted',`.
  2. `src/rebalancer/rebalance-coordinator-operation-creation-support.js:528`: `reason:
     PLACEMENT_ADMISSION_ERROR.BYTES,` -> `reason: PLACEMENT_ADMISSION_ERROR.REPLICA_IDENTITY_NOT_ADMITTED,`.
  No clearing-trigger row is needed: `replica-placement-owner-clearing-triggers` enumerates `PLACEMENT_REFUSAL`
  and `PLACEMENT_WAITING_REASON` (replica-placement-owner-constants.js), not `PLACEMENT_ADMISSION_ERROR`, and the
  refusal is terminal for the request.
- Can a production caller send `replicaId` on a partition ADD? [R] No caller found:
  `buildProvisioningCreateOperationMove` (sql-query-engine-provisioning-admission-methods.js:455-475) has no
  replicaId; the unified rebalancer forwards `move.replicaId` (unified-rebalancer-move-execution.js:62) but its
  ADD moves come from the deficit cure (move-planner-move-calculation-methods.js:130-135) without one; the
  planner moves that carry `replicaId` are the failed-replica, surplus and relocation REMOVE cures
  (:332-336, :689-693, :804-808). REPLACE with both `sourceReplicaId` and `replicaId` was not found in a
  production planner either.

## Representative red files at ab3e4b9af: their next honest state

| File | Before (b07094a76 probe) | After | Owner of the remainder |
|---|---|---|---|
| control-plane/heartbeat-liveness-at-commit | TypeError on the endpoint write, beats fail | **green** (endpoint write is a typed unknown, deferred) | none |
| bootstrap/register-service-move-handoff-refused | 500 TypeError | **green** | none |
| runtime/service-runtime-consensus-publication | SERVICES_ROW_PROJECTION_FAILED (TypeError) | typed unknown re-sent under its key until the owner's 30 s bound per write, so the file hits the 600 s budget | fixture (createCreationSqliteFixture engine has no receipt) |
| control-plane/service-instance-creation-cas | UNKNOWN (swallowed TypeError) | same 30 s bound per receipt-less write (34 attempts each, `wait_bound_spent`), 600 s budget | fixture (same) |
| wasm-service/bound-remove-physical-operation | founders not settled (TypeError) | still not settled, 243 s instead of 2.8 s | fixture (same) |
| integration/control-plane-postgres-wire-scale | 500 TypeError | 503 owner_not_ready after the retry bound (121 s) | fixture (engine fake `{success,affectedRows}`) |
| bootstrap/node-registration-idempotency | outcome not known | unchanged (typed unknown, no read-back in the mock) | fixture |
| control-plane/heartbeat-memory-trend | 1 vs 3 upserts | unchanged | fixture |
| query/sql-query-engine-create-table-quorum | empty message | named deadline message, still not /insufficient/ (10 ms budget) | fixture |
| bootstrap/bootstrap-api | 500 | 503 typed (test stands on the removed SQL fallback) | fixture |

Fixture-debt note for the other writer: the receipt-less fakes now cost each owner write its full retry
bound (system-metadata owner: 30 s, 34 re-sends under one key) before the typed unknown, so unmigrated files
are slow (up to the 600 s file budget) rather than fast-failing. That is the owned continuation of an
unproven write, not a hang.

## Could not close

- Item 6 product edit (vocabulary owned by two other writers): handed over above; its witness stays red.
- Item 3: no execution covers the seed's bootstrap window; the conclusion is by reading.
- The classifier's ungated `accepted`/`known` for failed answers with a known outcome (item 2 residual) and
  the missing `UNKNOWN` mutation outcome: reported to their owner, not edited.
- `write-exactly-once-property` is red before and after (d471620a9 scope refusal on a user table); not
  examined.

---

# Stage 3 (corrective), 2026-11-21 ~19:00Z-

Agent `claude:named-write-2` (single writer), worktree
`/mnt/data/peter/projects/.worktrees/line-regression-causes-20261121`, branch
`work/line-regression-causes-20261121`, taken over at ab3e4b9af (clean). Instruction sources: CLAUDE.md,
`docs/steering/rules.md` (R07, R08, R11, R14), `test/guidelines/INDEX.md`, the lead's corrective brief,
`reports/verify-named-write-judge.md` (APPROVE-WITH-CONDITIONS). Lab only (adam-laptop), commits through
heavy.sh. Marking as in stages 1-2: [X] executed, [R] read, [I] inferred.

## Files declared before editing (item 1)

- Owner of the vocabulary and its classifier: `src/control-plane/control-plane-system-table-gateway-constants.js`
  (`CONTROL_PLANE_MUTATION_OUTCOME`), `src/control-plane/control-plane-mutation-outcome-classifier.js`.
- Producer of the one unknown shape (returned and thrown): `src/control-plane/control-plane-write-identity.js`
  (`unresolvedAnswer`, `observedWriteResult`, `resolvePendingInstance`: where a thrown transport unknown of a
  named write is converted).
- The four consumers: (1) gateway telemetry + ledger: `control-plane-system-table-gateway-telemetry.js`,
  `control-plane-system-table-gateway-mutation-submission.js`; (2) the outcome snapshot / owner contract:
  `control-plane-system-table-gateway-mutation-contracts.js`; (3) the admin owner route:
  `src/admin/admin-owner-operations.js`; (4) the authoritative-row helper:
  `src/raft/authoritative-row-mutation-vocabulary.js` - under `src/raft/**`, which the brief forbids: NOT edited,
  exact edit handed over below; its guard `test/raft/authoritative-row-mutation-outcome-classifier.test.js` is
  updated to the target and stays red until that edit lands.
- `control-plane-system-table-gateway-telemetry.js` needed no edit: it already reads `result.outcome`; the
  gateway's catch path (mutation-submission) now hands it the named outcome.

## Red-before [X]

Witness commit 70dfcdba85a6f3aa74ddbc296d47abe730a1eb8e (tests only; pushed), adam-laptop,
`lab/nw2-red-70dfcdba8-1/` (+`.console.log`): 8 files, 7 red, 1 green, 312 assertions.

| File | Result at 70dfcdba8 (= product of ab3e4b9af) |
|---|---|
| control-plane/named-write-outcome-total | red on exactly 4 new rows: zero participants APPLIED (plain and CDC-wrapped), a NOT_LEADER refusal carrying a commit witness NOT_PROPOSED, a self-wrapping CDC answer THROWS RangeError; the other new rows (failure/deferred with witness, right entry wrong partition, earlier attempt replay APPLIED, earlier instance replay, partial witnesses, term/logIndex 0/negative/text, array answer/witness, counts disagree) already as expected |
| control-plane/named-write-unknown-outcome-shape | red: no UNKNOWN member; returned unknown: caller outcome none, telemetry `owner_not_ready`, ledger null, snapshot `owner_not_ready`, classifier `known:false`, owner error outcome none, admin 503 `owner_not_ready` with code ADMIN_OWNER_NOT_READY; thrown transport timeout: the caller gets a THROWN error, telemetry `owner_not_ready`, snapshot `rejected`, admin answers **500 `failed`** |
| query/named-write-real-producer-definite | item 2: no-match UPDATE and DELETE are one witnessed participant with 0 rows, APPLIED (a proven zero); the real coordinator's empty plan answers `participantResults: []` and is judged APPLIED (red). item 3: SQL gateway and CDC-local-leader constraint violations FAILED; CDC shutdown NOT_PROPOSED; SQL-gateway NOT_LEADER NOT_PROPOSED; **CDC through the engine: constraint violation UNKNOWN and NOT_LEADER refusal UNKNOWN** (red), both not definite at the caller |
| control-plane/control-plane-mutation-outcome-classifier | red (no UNKNOWN row; contradictions accepted) |
| raft/authoritative-row-mutation-outcome-classifier | red (no UNKNOWN in the vocabulary) |
| query/provisioning-deadline-error-message | red: managed split child deadline message `""`; QUERY_ERROR_MSG census over src finds the managed-split reference |
| constants/message-table-census | red: 6 undefined members (3163 accesses checked; 3 computed and 66 on parameter-bound tables not checked), list in item 4 |
| bootstrap/seed-bootstrap-direct-lane.integration | **green**: a real fresh seed (public startLagrangeRuntime child, warn logging) bootstrapped in 26 s without one BOOTSTRAP_RAFT_WRITE_LANE_FELL_BACK |

Item 3 reproduction [X]: the CDC's thrown error (`buildSystemTableMutationError`) carried `participantFailures`
(partition `storage_reservations-p1`, `SQLITE_CONSTRAINT_PRIMARYKEY`, `committed:true`,
`outcome:'statement_failed'`, resp. `partition_write_not_leader`) but no top-level `partitionId`, no
`participantResults`, partition set or key, so the judge could take neither its distributed branch nor the
single nested failure: UNKNOWN. That is the place that loses the partition identity.

## Item 5 (report only): the CDC bootstrap-direct lane's fallback arm

- Reachable [R]: only on the seed (`BootstrapSystemTableWriter` is constructed once, seed-registration-phase.js:707)
  while the shared CDC service is in bootstrap mode: `systemTableWriter.enable()` (seed-registration-phase.js:126,
  after `waitForRequiredPartitionLeadership()` for the PARTITIONS, SERVICES, TABLES and MESSAGE_GROUPS partitions
  only) until CDC normal mode / `swapSystemTableWriter()` in cache hydration (seed-cache-hydration-phase.js:~250-278).
  Not later. Within that window the arm runs whenever the raft lane (`raftLaneService.executeQuery(sql, params)`,
  no key) answers `success:false` for ANY reason or throws for ANY reason: NOT_LEADER/no leader, backpressure,
  commit-deadline exceeded, OUTCOME_UNKNOWN (handed to consensus, may commit), a committed statement failure,
  a statement refusal, a thrown transport or apply error.
- What it does [R]: `executeLocalQuery` on every local candidate replica, outside raft, under no key. It is
  fenced only by `unreplicatedLocalMutationRefusal` (refuses once the partition's TX1 write origin exists or
  the cutover pause is up); the origin is proposed later by the participant release owner's ENABLE
  (replica-handler-participant-release.js:186), so in the seed window the fence does not refuse [I: no
  execution shows the origin absent in the window].
- Double apply / divergence [R+I]: after an OUTCOME_UNKNOWN or post-proposal throw, the direct execution
  applies the row locally and the raft entry may still commit and apply again: an INSERT then fails at raft
  apply on that replica (its committed outcome row says statement_failed for an entry whose effect exists),
  a non-idempotent UPDATE applies twice; a replica that catches up by log replay applies the entry once and
  records `applied`: the outcome records diverge. After a pre-proposal refusal the row exists only on the
  local replica, not in the log: any replica that catches up by log replay never gets it (the round-11
  divergence the code comment cites). A definite committed failure is simply re-run and fails again.
- Witness [X]: `test/bootstrap/seed-bootstrap-direct-lane.integration.test.js` (no product change; the shared
  public child gained an optional log-level argument, default unchanged) - green at 70dfcdba8: the arm did
  not run in one real fresh-seed bootstrap. This is evidence the arm is not needed for a normal fresh seed,
  not proof it is dead (one run; registration waits for the leaders of four partitions, while the window
  also writes service_definitions, dynamic config, epoch, cluster id and formation declaration rows whose
  partitions are not in that wait [R]). A proof of necessity would need the arm removed (a product change):
  bootstrap a seed N times with the arm deleted and the raft lane's failures surfaced typed.
- Recommendation: delete the arm (R11, no fallback): on a raft-lane failure in the window answer the raft
  lane's own typed result (the registration owner already retries), and make the window wait for the
  leaders of every partition it writes. Gate: the witness above, repeated (e.g. 10 fresh seeds on the lab),
  plus one run with the arm deleted.
- Named writes in the window [R, partly I]: registration-phase writes go through `BootstrapSystemTableWriter`
  straight to the CDC service (unnamed); seed partition service rows are activated through the same writer
  (seed-registration-phase.js:295, unnamed); dynamic configuration goes through the gateway without
  `writeIdentity` (a minted key, unnamed); `runRetryableControlPlaneWrite` names only writes whose executor
  passes the minted identity on (system-metadata owners do; the partition write commit and replica-handler
  status retries do not). Heartbeat, registration and endpoint owners start after bootstrap; log persistence
  after readiness (verifier [V]). Not established: whether any system-metadata owner write, reservation,
  replica_operations or membership-publication write is issued by a background owner started in the
  INFRASTRUCTURE/MESSAGE_GROUPS/PARTITIONS phases while the window is open [I: none found]. The bootstrap lane
  ignores the write options entirely (`executeSQLDirectToLocalPartition(sql, params, _options)`), so such a
  write would lose its key (stage 2 finding).

## Item 6 (record for the merge)

- Correction of the stage-2 hand-off (item 6 there): its claim "no clearing-trigger row is needed:
  replica-placement-owner-clearing-triggers enumerates PLACEMENT_REFUSAL and PLACEMENT_WAITING_REASON, not
  PLACEMENT_ADMISSION_ERROR" is wrong. On `work/placement-outcome-format-20261121`,
  `src/rebalancer/replica-placement-owner-constants.js` ~:170-199 classifies EVERY admission code: either in
  `PLACEMENT_DEFINITE_ANSWER_CODES` or in `PLACEMENT_WAITING_CLEARING_TRIGGER` (which lists the admission
  errors OWNER_UNAVAILABLE and REPAIR_PENDING), "a code reachable on the admission path that is in neither
  declaration is a defect". The new `PLACEMENT_ADMISSION_ERROR.REPLICA_IDENTITY_NOT_ADMITTED` must join
  `PLACEMENT_DEFINITE_ANSWER_CODES` (a request-shape refusal never becomes admissible by waiting; next to its
  sibling REMOVE_INTENT_UNSCOPED). Whether it also belongs to `STATIC_PRE_PROPOSAL_FAILURE_CODES`
  (placement-admission-attempt.js:14-19) is the owner's call (the coordinator throw passes no answer, so that
  set is not consulted today).
- Merge note: this branch must NOT be merged ahead of the receipt-fake fixture migration: unproven writes are
  re-sent under their key to the owner's bound (34 attempts in 30 s), so the four unmigrated files of the
  stage-2 after-run went from 8 s to 1565 s (two at the 600 s file limit).

## Hand-over edits outside this writer's scope (exact)

1. Item 1, the fourth consumer (`src/raft/**` is forbidden to this writer):
   `src/raft/authoritative-row-mutation-vocabulary.js` - add `OUTCOME_UNKNOWN: 'outcome-unknown',` to
   `AUTHORITATIVE_ROW_MUTATION_REASON`, and
   `GATEWAY_OUTCOME_MUTATION_REASON[CONTROL_PLANE_MUTATION_OUTCOME.UNKNOWN] = AUTHORITATIVE_ROW_MUTATION_REASON.OUTCOME_UNKNOWN;`
   before the `objectFreeze`. Behaviour: unchanged retry (`resolveMutationFailure` schedules one for every
   non-applied answer); the label stops saying `rejected` (today an UNKNOWN answer gets `reason: undefined`
   after this branch's vocabulary change, a label only, no branch reads it [V verifier]). Witness:
   `test/raft/authoritative-row-mutation-outcome-classifier.test.js` (updated here to expect
   `'outcome-unknown'`; red until the edit lands).
2. Item 4, undefined message members the all-src census found outside `QUERY_ERROR_MSG` (witness
   `test/constants/message-table-census.test.js`, red until these land):
   - `src/bootstrap/owners/service-leader-readiness-owner.js:594` `BOOTSTRAP_API_LOG_MSG.LEADERS_READY || LOCAL_STR_ALL_SERVICE_LEADERS_READY`
     (a fallback): add `LEADERS_READY: 'All service leaders ready'` to `BOOTSTRAP_API_LOG_MSG`
     (`src/bootstrap/bootstrap-api-constants.js`), drop the `||` and the local string (:38).
   - `src/bootstrap/shared/node-state-publication-outcome.js:115` `JOINING_ERROR_MSG.CONTROL_PLANE_MESSAGE_WAS_NOT_ACKNOWLEDGED`:
     the text exists only in `NODE_JOINING_SERVICE_LITERAL` (node-joining-service-shared.js:233); move it to
     `JOINING_ERROR_MSG` (`src/bootstrap/node-joining-constants.js`). Today an undelivered node-state
     publication without transport text throws an Error with an EMPTY message.
   - `src/transport/message-router-connection-close-reconnect.js:391` `ROUTER_LOG_MSG.CONNECTION_PING_TIMEOUT_SKIPPED_ALIVE`
     and `src/transport/message-router-peer-liveness.js:95` `ROUTER_LOG_MSG.PING_TIMEOUT_SATISFIED_BY_INBOUND`:
     add both to `ROUTER_LOG_MSG` (`src/constants/transport.js`); today they log `undefined` as the message.
   - `src/transport/router-server-manager.js:196` `ROUTER_ERROR_MSG.addressInUse(portKey)`: add
     `addressInUse: (port) => \`Address in use: in-process port ${port}\`` to `ROUTER_ERROR_MSG`; today an
     in-process port collision throws `TypeError: ROUTER_ERROR_MSG.addressInUse is not a function` instead of
     the EADDRINUSE error.

## Repairs and green-after [X]

Repair commit baa2a25802570aa5cf6ecd9c3e106f76cd93b0a5 (pushed), adam-laptop,
`lab/nw2-after-baa2a2580-1/` (+`.console.log`): 21 files.

- Green after: named-write-outcome-total (all 52 rows), named-write-unknown-outcome-shape (4/4),
  named-write-real-producer-definite (7/7, incl. the owner sending a definite CDC constraint failure exactly
  once), control-plane-mutation-outcome-classifier, node-registration-owner (UNKNOWN row added: withdrawal
  deferred), seed-bootstrap-direct-lane (again no fallback, 27.8 s), and the QUERY_ERROR_MSG all-src census.
- Red by design (hand-over above): message-table-census (exactly the 5 out-of-scope members),
  raft/authoritative-row-mutation-outcome-classifier (`reason` for UNKNOWN until the src/raft edit).
- Witness defect found and corrected (not a product defect): provisioning-deadline-error-message case 3
  asserted `code:'TIMEOUT'`; the timeout owner (`createTimeoutBudgetError`) sets only `errorCode`, the
  founding path copies it to `code` (sql-query-engine-provisioning-admission-methods.js:296), the managed
  split does not. It was red at 70dfcdba8 for that reason, not for the message. Corrected to assert
  `errorCode` + the named message (commit below). Finding for the timeout owner: one deadline error, two
  shapes (`code` present on one path only) [R].
- Comparison with `lr-s2-after-ab3e4b9af-1` (previous writer's 5 witnesses + 8 guards): identical status for
  all 13 (placement-explicit red by design, write-exactly-once-property red for the same d471620a9 scope
  refusal, 76 refusal lines; all others green), durations within noise (write-identity-instance 247.3 s vs
  246.8 s, write-exactly-once 148.4 s vs 146.2 s, membership-publication 9.8 s vs 12.2 s).

## Item 1: what each consumer reports and does for an unknown write (after baa2a2580)

The unknown named write is ONE returned answer whether the producer answered without proof or the transport
threw the typed unknown: `{success:false, outcome:'unknown', completionState:'unknown', deferRetry:true,
failureCode:'partition_write_outcome_unknown', entryId, contractState:'pending', nextAction:'retry',
pendingInstance (its own, outcome 'unknown'), cause: <the producer's answer or error, unchanged>}`; no
count, no transport classification. A thrown failure that names no unknown (a refusal before delivery, an
internal error) stays thrown as before. Witnessed identical for both producers (same field set).

| Consumer | Reports | Does |
|---|---|---|
| Caller (gateway answer) | outcome `unknown`, contract PENDING / RETRY | re-sends under the same key (owner retry loop, held instance) or reads back |
| Gateway telemetry | `mutationOutcomeCounts.unknown` (also for a thrown unnamed write carrying the typed code) | diagnostic only |
| Gateway ledger | `outcome:'unknown'`, `success:false`, `affectedRows:0` | diagnostic only |
| Outcome snapshot / owner contract | `unknown` / completion `unknown`; contract PENDING, next action RETRY, freshness STALE | as above |
| Classifier | `known:true, outcome:'unknown', applied:false, accepted:true, deferred:true, retryable:true, terminal:false, failed:true`, no count (`affectedRowsPresent:false, zeroAffectedRows:false`) | single-row confirmation, PG-wire scale, node removal: not applied, not "changed" -> their OUTCOME_UNCONFIRMED (deferRetry) |
| System-metadata owner error | `outcome:'unknown'`, `deferRetry:true` | caller retries or reads back |
| Admin owner route | HTTP 503, `outcome:'unknown'`, `errorCode:'ADMIN_OWNER_OUTCOME_UNKNOWN'`, `mutationOutcome:'unknown'`, owner's own code as `ownerErrorCode` | the client must not read it as refused / not-ready (the split-brain verifier's PRE_MUTATION_REFUSALS treated ADMIN_OWNER_NOT_READY as "not admitted"); before: 503 owner_not_ready (returned) or 500 failed (thrown) |
| Authoritative-row helper (src/raft, hand-over) | today `reason: undefined`; with the edit `outcome-unknown` | schedules its retry (unchanged) |

Classifier flags after the change (stated in the owner): `known` - the answer names a vocabulary outcome that
agrees with its own success; `applied` - proven applied; `accepted` - not refused (admitted, deferred or
handed over); `deferred` - its owner continues it later; `retryable` - may be sent again; `terminal` - nothing
continues it; `failed` - the producer's own `success:false`. They are properties of the named outcome and
deliberately NOT gated by `failed` (a failed answer legitimately names DEFERRED, OWNER_NOT_READY or UNKNOWN);
the verifier's case (APPLIED on a failed answer) is a contradiction and now fails closed (invalid), as does
UNKNOWN on a successful answer.

## Item 2 decision [X]

Real producers: a named UPDATE or DELETE matching no row is answered by its one partition with a durable
commit witness and 0 rows (a proven zero, APPLIED) on the SQL gateway path; the engine refuses a write plan
with no partition before the coordinator (`resolveWriteExecutionPlanWithAuthorityRefresh` /
`hasRoutableTablePlan`: table-not-found or authority-unavailable) and the parser refuses INSERT ... SELECT, so
no real engine answer for a named system-table write has zero participants [R]; only the coordinator called
directly with an empty plan produces `participantResults: []` [X]. Decision: such an answer means "no
partition was asked", proves nothing of the named entry on its declared partition, and is UNKNOWN (not
APPLIED; not NOT_PROPOSED either, which is reserved for a typed refusal ON the declared partition).
Also decided: a refusal that carries a durable commit witness is contradictory evidence -> UNKNOWN (it was
NOT_PROPOSED and would have released the instance); the judge's CDC recursion is depth-bounded.
- Corrected witness: 5392380ae2 (`git log`: "test: the managed split deadline witness asserts the timeout
  owner's typed code", pushed), `lab/nw2-after-5392380ae-1/`: provisioning-deadline-error-message 4/4 green.
  Its red-before evidence for the managed-split line is the all-src QUERY_ERROR_MSG census row at 70dfcdba8.

## Commits (branch work/line-regression-causes-20261121, all pushed)

| Sha | Content | Lab |
|---|---|---|
| 70dfcdba8 | witnesses only (red) | `nw2-red-70dfcdba8-1` (7/8 red as intended; seed lane green) |
| baa2a2580 | repairs: items 1, 2, 3, 4 | `nw2-after-baa2a2580-1` (21 files) |
| 5392380ae | witness correction (managed-split case) | `nw2-after-5392380ae-1` |

## Residual findings (recorded, not changed)

- A caller whose own wait ends while its delivery is in flight (WAIT_INTERRUPTED: deadline or cancellation)
  still gets the caller's thrown error with `pendingInstance.outcome:'unknown'`, not the canonical answer; a
  caller-owned interruption, left thrown.
- `pendingInstance` means two things: on the unknown answer its own instance (now always), on a settled
  answer the EARLIER instance resolved before it was issued (R08; no live hazard found: registration and
  reservations pass `pendingAppliedSettles`).
- The gateway's thrown-mutation telemetry still takes `error.outcome` when present, which for a CDC error can
  be the partition's committed-command outcome (`statement_failed`), another vocabulary (R08).
- `buildSystemMetadataMutationError` replaces the owner error's cause with `result.cause`, so the owner
  error's cause chain loses the canonical unknown answer (its `outcome` is still copied).
- An unnamed write's thrown transport unknown still carries no named outcome from its producer (the CDC);
  the gateway classifies it by the kernel's typed code.
- The provisioning-deadline error has `code` on the founding path only (timeout owner sets `errorCode`).

---

# Stage 3 follow-up (coordinator, ~20:00Z): hand-over edits, fallback deletion, bootstrap-window owners

## Hand-over edits: file check and what was made

`git diff --stat 23344cddc origin/work/raft-frame-delivery-20261121 -- <file>` (origin/work/raft-owner-authority-20261121
does not exist: skipped): only `src/constants/transport.js` is touched (consensus-envelope members, not the
router members). Made in e5cdc7770: `src/raft/authoritative-row-mutation-vocabulary.js` (UNKNOWN ->
`outcome-unknown`), `BOOTSTRAP_API_LOG_MSG.LEADERS_READY` (owner `bootstrap-api-constants.js`; the `||` fallback
and local string removed), `JOINING_ERROR_MSG.CONTROL_PLANE_MESSAGE_WAS_NOT_ACKNOWLEDGED` (owner
`node-joining-constants.js`; the unconsumed copy in `NODE_JOINING_SERVICE_LITERAL` removed). LEFT, exact text in
the earlier hand-over list: the three `src/constants/transport.js` members (`ROUTER_ERROR_MSG.addressInUse`,
`ROUTER_LOG_MSG.CONNECTION_PING_TIMEOUT_SKIPPED_ALIVE`, `ROUTER_LOG_MSG.PING_TIMEOUT_SATISFIED_BY_INBOUND`);
witness `test/transport/router-in-process-address-in-use.test.js` added (red until that edit).

## Fallback arm: real-cluster log counts [X]

Line: `CDC_LOG_MSG.BOOTSTRAP_RAFT_WRITE_LANE_FELL_BACK` ('Bootstrap raft write lane unavailable - falling back
to direct per-replica write', warn level 40, logged before the arm runs). Node logs are the playback copies
`.playback/report/fresh-formation-user-table-routability/<nodeId>.log`; the seed is the one node with the
hydration step `configureCdcIntegrationForNormalMode` (the end of the window).

| Run | Seed log | Window (first line -> CDC normal mode) | warn lines in window | fallback lines | other two nodes |
|---|---|---|---|---|---|
| gcp-formation-f580579a5-run1 | 751f5575 (3.6 MB) | 12:14:19.805Z -> 12:14:41.053Z | 2 | **0** | 0, 0 |
| gcp-formation-f580579a5-run2-profile | 95ce5141 (3.9 MB) | 13:17:02.339Z -> 13:17:26.764Z | 3 | **0** | 0, 0 |

Positive control: both seed logs start at process start and carry warn lines inside the window, so a fallback
would have been logged. No retained lab formation run has a seed node log (the `w1b-*-core-formation`
directories are test-run logs only). Plus two lab fresh-seed starts (70dfcdba8, baa2a2580): 0.

## Item 3: owners started before the window closes [R]

The window is CDC bootstrap mode: `systemTableWriter.enable()` (seed-registration-phase.js:126) until CDC normal
mode in CACHE_HYDRATION (seed-cache-hydration-phase.js:268, swap :278). Seed sub-phases run in order
INFRASTRUCTURE, MESSAGE_GROUPS, PARTITIONS, REGISTRATION, CACHE_HYDRATION (bootstrap-service-seed-workflow.js:64-72);
`initializeControlPlaneService()` (:450, after CONTROL_PLANE_READY :422) - which initializes the rebalance
coordinator (control-plane-setup.js:371) and starts the heartbeat (:711) - runs only after CACHE_HYDRATION.
A named write exists only through a gateway's `runControlPlaneWrite` with `writeIdentity`; the CDC service and
`BootstrapSystemTableWriter` never name a write.

| Owner started before the window closes | Where | Writes | Named? |
|---|---|---|---|
| StartupServiceLifecycleOwner: bootstrap message-group and partition replicas | seed-infrastructure-phase.js:81, :103, :115 | none of its own | - |
| MessageGroupService + election; its service-row owner | seed-message-groups-phase.js:151, :233; message-group-service-row-owner.js:257 | services row via `owner.systemTableWriter` (the bootstrap writer in the window) | no |
| PartitionService replicas, elections, replica progress | seed-partitions-phase.js:220, :229, :321 | partition registration rows via `systemTableWriter` (partition-service-row-owner.js:115-172) | no |
| StartupRecoveryCoordinator | seed-partitions-phase.js:615 | none (evaluates readiness) | - |
| Replica state machine transitions (replica handler status) | replica-state-machine-transition.js:549-574 | gateway `submitMutation` with `coalescingKey` only (:741) | no |
| Registration phase | seed-registration-phase.js:128-135, :295 | via `BootstrapSystemTableWriter`; dynamic config via gateway without `writeIdentity` | no |
| Latency owners | seed-cache-hydration-phase.js:168 | gateway, unnamed (stage 2 [R]) | no |

Answer: no owner started before the window closes issues a named write in it [R]. The rebalancer
(reservations, replica_operations), membership publication, registration/endpoint authorities, heartbeat and
system-metadata owner writes start after it.

## Fallback deletion pair [X]

| Sha | Content | Lab |
|---|---|---|
| e5cdc7770 | hand-over edits (raft reason, LEADERS_READY, JOINING member) + addressInUse witness | `nw2-red-a203b2c36-1` (raft guard green; census red only for the 3 transport members; addressInUse witness red: `TypeError: ROUTER_ERROR_MSG.addressInUse is not a function`) |
| a203b2c36 | fallback witnesses (observer in the real seed child) | `nw2-red-a203b2c36-1`: refusal witness RED - the injected NOT_LEADER on the first window INSERT into `services-p1` was re-executed outside raft (1 direct write) and the seed still failed (`original-allocation-observation-unavailable`, 11.3 s); normal start green (27.0 s, window wrote services through raft, 0 direct writes) |
| 097888f1a | deletion of the arm (+ its log message; the routing test now pins its absence) | `nw2-after-097888f1a-1`: refusal witness GREEN (no statement outside raft, owned outcome), normal start GREEN (30.3 s), bootstrap-direct-write-raft-routing, bootstrap-sequence, seed-registration-phase green |

- No explicit wait was added: the normal start never took the arm before the deletion (0 direct writes in the
  witness, 0 fallback lines in GCP/lab), so the code path a normal start executes is unchanged by it; the
  existing wait is `waitForRequiredPartitionLeadership()` (seed-registration-phase.js:119, inside the bootstrap
  deadline). Start time (file duration, adam-laptop): before 26.0 / 27.8 / 27.0 s, after 30.3 s (one sample;
  +3 s with an unchanged path, so load noise by construction, a repeat is advisable).
- **STOPPED (context budget): fixture debt of the deletion, 5 unit files red at 097888f1a**, all fakes that
  model the window's write lane as `executeLocalQuery` only or assert the direct fan-out:
  `test/cdc/cdc-integration-service-execute-sql-and-delivery.test.js` (cases 1, 3: "partitionService.executeQuery
  is not a function"), `test/cdc/cdc-integration-service-node-state-and-bootstrap.test.js` (cases 28, 32, 33),
  `test/bootstrap/bootstrap-mode.test.js` ("writes go to local partitions when bootstrap enabled"),
  `test/cdc/bootstrap-mode-routing.property.test.js` (Property 6), `test/cdc/cdc-shutdown-terminal-owner-write.test.js`
  ((i), (ii-a): the released write's terminal answer through the bootstrap lane). Migration: each fake's
  bootstrap write lane becomes `executeQuery` (the raft lane), and assertions of per-replica direct writes
  become "no statement outside raft". Until then 097888f1a can be reverted on its own.
