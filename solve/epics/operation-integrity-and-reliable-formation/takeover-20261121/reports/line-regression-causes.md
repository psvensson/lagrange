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
