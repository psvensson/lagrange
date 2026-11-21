# Verification: named-write stage 3 and the bootstrap fallback deletion (ab3e4b9af -> 097888f1a)

Verifier: independent subagent, 2026-11-21. Read-only: `git show / diff / grep` at fixed refs and reads of the
retained lab files. Nothing was executed, no test was run, no worktree was written.
Subject: `work/line-regression-causes-20261121`: 70dfcdba8, baa2a2580, 5392380ae, e5cdc7770, a203b2c36, 097888f1a.
Marking: **[V]** verified by reading the named ref/file or lab file; **[I]** inferred, not verified.

## Verdicts

- **(i) Named-outcome / judge commits through e5cdc7770: REJECT as it stands** (one new safety defect, finding 1;
  one undeclared behaviour change, finding 2). Everything else in (i) is confirmed.
- **(ii) Fallback deletion 097888f1a: APPROVE-WITH-CONDITIONS** (findings 6 and 7).

## Findings

### 1. DEFECT (new in baa2a2580): a first attempt can be judged NOT_PROPOSED while its entry may still commit [V reading, I reachability]
- `src/cdc/cdc-routed-mutation-readiness.js:537-690` (097888f1a): the CDC routed-mutation loop re-sends a
  retryable failure under the SAME idempotency key (`:527-530`) and throws only the LAST engine answer
  (`:626`, `:630`: `buildSystemTableMutationError(result, message)`); `annotateSystemTableMutationError`
  (`cdc-integration-service-shared.js:580-597`) adds `attempt` and `writeMode`, never an earlier answer.
  A typed unknown is retryable here (`isTransientCdcError` -> `isRetryableControlPlaneError`).
- The executor's unknown-outcome owner (`src/query/query-executor-unknown-outcome.js`) keeps "unresolved"
  sticky ("a re-delivery refused before it was proposed does not settle it") only inside ONE delivery; each
  CDC attempt is a new engine call with a new tracker.
- baa2a2580 makes the thrown CDC error carry `participantResults`, the participant set and the key
  (`cdc-integration-service-shared.js:392-404`) and makes the judge treat an Error as a failed distributed
  answer (`control-plane-named-write-outcome.js:140-147`). Before it, every thrown CDC failure was UNKNOWN
  (the author's own reproduction), which masked the lossy loop.
- `settleInstance` (`control-plane-write-identity.js:245-257`) releases on NOT_PROPOSED when
  `record.unresolved` is false; that flag is set only by earlier NAMED attempts, not by CDC inner attempts.
- Minimal schedule: named write W (key K, partition P), first named attempt. CDC attempt 1: the leader takes
  the proposal and loses leadership; the engine answers `partition_write_outcome_unknown`. CDC attempts 2..n
  under K: no leader yet, each answers `partition_write_not_leader` on P. The loop throws the last answer.
  Judge: NOT_PROPOSED. The instance is released and `isControlPlaneWriteDefinitivelyUnappliedError` is true
  (consumer: `node-registration-incarnation-write.js:403-411` then treats the write as determinate). The
  entry of attempt 1 can still commit on the new leader. Unknown is treated as a rejection.
- Not covered by a witness: `named-write-real-producer-definite` sends one definite answer; no case has an
  unknown followed by a refusal inside one CDC call.
- Repair direction: the CDC loop must keep an unknown sticky across its attempts (answer the typed unknown,
  or link the earlier answer), as the executor's owner does.

### 2. Undeclared behaviour change (baa2a2580): the CDC's terminal SHUT_DOWN answer no longer reaches the owner as the thrown typed error [V lab + reading, I attribution]
- `buildShutDownAnswer(NOT_CONFIRMED, cause)` (`cdc-integration-service-lifecycle.js:261-301`) is an Error with
  `code: CDC_SHUT_DOWN` whose `cause` carries `failureCode: OUTCOME_UNKNOWN`. `someLinkedAnswer` follows
  `cause`, so `isUnresolvedObservation` (`control-plane-write-identity.js:386-389`) converts it into the
  returned unknown answer (`deferRetry: true`, no code). Every owner write through
  `runRetryableControlPlaneWrite` is named (`retryable-control-plane-write.js:119-134`).
- Lab, `nw2-after-097888f1a-1`, `test/cdc/cdc-shutdown-terminal-owner-write.test.js`: cases (i), (ii-a) AND
  (iv) are red (log lines 671-742). (i) and (iv) fail on "the answer is the CDC service's typed shut-down
  code" after passing "no retry delay" and "classifier holds the answer terminal"; (ii-a) arms a retry
  delay `[100]` after shutdown began.
- The author records this file as fixture debt of the deletion ("the released write's terminal answer
  through the bootstrap lane"). That is wrong: the fixture sets `bootstrapMode = false` (test `:223`) and
  the write is held by the SQL engine fake (`:182-190`); 097888f1a touches only `cdc-bootstrap-direct-sql.js`
  and one constant. This file was in no lab run between ab3e4b9af and the deletion, so "red since
  baa2a2580" is my reading, not an observation.
- Effect: terminality survives through the linked classifier (`isControlPlaneWriterShutDown`,
  `isRetryableControlPlaneError` both walk `cause`) [V]; a reader of top-level `code` or of `deferRetry`
  alone no longer sees a terminal answer. It needs a decision and its own witness, not a fixture migration.

### 3. UNKNOWN as a named outcome: confirmed, with two labelling residues [V]
Classifier row (`control-plane-mutation-outcome-classifier.js:119-131`): not applied, accepted, deferred,
retryable, not terminal; count forced absent (`:333-336`). Every reader of the flags (grep of
`.failed/.accepted/.terminal/.known` over `src` plus all 40 call sites by line):

| Consumer | With UNKNOWN |
|---|---|
| Single-row confirmation `:15-28` | `failed` -> throws the system-metadata error (`deferRetry`, `outcome:'unknown'`), not its `unconfirmed` error as the author's table says; never "changed" |
| nodes-owner `:97-110`, PG-wire scale `:61-77` | OUTCOME_UNCONFIRMED, `deferRetry` |
| Join-admission withdrawal `:136-203` | the one reader of `accepted`: accepted, not success, withdrawal deferred |
| Outcome snapshot / contract (`...-mutation-contracts.js:48-66, 164-216`) | `unknown` / PENDING / RETRY / STALE |
| replica-create-admission `:511, :608` | DEFERRED, not STALE |
| replica-state-machine-durability `:16-26` | `deferRetry` |
| latency edge `:524-538` | EDGE_WRITE_UNCONFIRMED, not a conflict |
| heartbeat `:77-91` | deferred to the next beat |
| authoritative-row helper | `outcome-unknown`, retry unchanged; `helper.js:429` branches only on observed-state-changed |
| all other sites | read `.applied` only: false |

- Contradictions (`:343-352`): APPLIED on a failed answer and UNKNOWN on a successful one give
  `valid:false`, and with it `failed:false, accepted:false, retryable:false`. Callers: snapshot REJECTED and
  contract BLOCKED / STOP; join admission rejected; create admission STALE; confirmation "unconfirmed"
  (retried). No consumer reads `!failed` as success. An invalid answer is therefore a rejection, which is
  fail-closed and acceptable for a shape no producer emits (`unresolvedAnswer` always sets `success:false`).
- No default branch treats an unrecognized outcome as success. Defaults that remain: the thrown-mutation
  telemetry counts a thrown definite failure as `owner_not_ready` (`...-mutation-submission.js:466-478`);
  `resolveControlPlaneMutationContractOutcome` ends in READY for any other outcome when `success !== false`
  (unreachable for UNKNOWN).
- Residue: the admin marker route never answers `ADMIN_OWNER_OUTCOME_UNKNOWN`. `LogsOwner` wraps every write
  failure in `unconfirmedDiagnosticMarker` (code `LOG_MARKER_OUTCOME_UNCONFIRMED`, `deferRetry`, no
  `outcome`), so `answerOwnerFailure` takes `ownerNotReady`: 503, body `outcome: 'owner_not_ready'`.

### 4. One shape for returned and thrown unknowns: by code, and not complete [V]
- Conversion point: `isUnresolvedObservation` / `observedWriteResult` / `resolvePendingInstance`
  (`control-plane-write-identity.js:386-405, 466-477`). A thrown error is converted only when it, or an answer
  linked through `partitionResult`, `firstFailedParticipant`, `cause`, `participantFailures`,
  `partitionErrors` (depth 4), carries `failureCode === 'partition_write_outcome_unknown'`
  (`partition-write-kernel.js:201-203`). By code, never by message text.
- A definite failure is not converted by it: FAILED and NOT_PROPOSED settle before the check. The one
  definite-looking error it does convert is the shut-down answer of finding 2.
- An unknown can stay thrown: a thrown error the judge answers UNKNOWN that carries no typed code (mixed
  participants, a participant on another partition, `<table>_mutation_retry_timeout_exhausted`, an internal
  error after the proposal). It is thrown with a null receipt. The instance stays held (safe); the admin
  route answers 500 `failed` unless it has `deferRetry`.
- A returned failure without the declared partition's identity is labelled UNKNOWN whatever it was (as at
  ab3e4b9af). New: its fields now travel only under `cause`, so a direct read of `errorCode` or
  `reasonCodes` on the answer is empty; `retryAfterMs` survives where the linked reader is used.
- Split-brain verifier: `test/distributed/scenarios/network-partition-marker.js:12-27`. REFUSED only for
  `ADMIN_OWNER_NOT_READY` and `LOG_MARKER_REQUEST_INVALID`; any other code is UNKNOWN. The new code is
  therefore read as UNKNOWN. On the marker route the hazard the author cites was not live (the body always
  carried the marker's own code).

### 5. Judge items [V]
- Partial application cannot be judged FAILED. FAILED and NOT_PROPOSED need every participant bound to the
  attempt's one partition (`belongsToNamedWrite`), and the participant set must equal the answers
  (`:101-110`); a participant on another partition is UNKNOWN, mixed verdicts are UNKNOWN (`:145-147`).
- Zero participants UNKNOWN (`:116-123`, `:142`), plain and CDC-wrapped; a refusal with a commit witness
  UNKNOWN (`:75-83`); recursion bounded at depth 2 (`:150-166`). The table has 31 + 21 = 52 rows with these
  rows present. Not in the table: a thrown distributed answer, and finding 1's sequence.

### 6. Fallback deletion: evidence confirmed, one transient refusal now fails the founding attempt [V, I where marked]
- Reachability before: bootstrap mode is enabled at one place (`seed-registration-phase.js:126`, writer built
  at `:707`), re-entry is forbidden (`cdc-integration-service-lifecycle.js:391-420`). The arm ran on any
  raft-lane failure or throw. A second, silent entry (no candidate with `executeQuery`) is reachable only
  with test fakes.
- Log counts (my own): `Bootstrap raft write lane unavailable` = 0 in
  `gcp-formation-f580579a5-run1/.playback/report/fresh-formation-user-table-routability/751f5575-...log` and
  0 in `...-run2-profile/.../95ce5141-...log`.
- The author's window is misstated: it starts at the first log line. The real windows are
  12:14:36.649Z -> 12:14:41.053Z (run 1, lines 533-568) and 13:17:21 -> 13:17:26 (run 2, lines 536-572).
  Run 1 has no warn line inside the real window; run 2 has one (line 552). The control still holds: the
  same `cdc-integration` logger writes info lines at both ends of each window, so a warn would be written.
- After the deletion the raft lane's answer is the write's answer; a returned failure becomes a thrown CDC
  error at the four callers (`cdc-integration-service-mutation-operations.js:264, 433`,
  `cdc-integration-service-mutations.js:107, 229`). In bootstrap mode there is no CDC retry loop, and the
  window's callers are single-shot (`seed-registration-phase.js:176-195, 334-345, 404-432, 462-470, 566-580`).
- The leadership wait covers PARTITIONS, SERVICES, TABLES, MESSAGE_GROUPS only (`:74-84`).
  `seed-partitions-phase.js:413-455` starts the elections of every other partition only after that wait and
  does not await them. The window then writes `service_definitions`, `service_endpoints` and `config`
  (run 1 log, 12:14:38.643 to 12:14:39.885), which no wait covers. `seedDynamicConfiguration` has an explicit
  leaderless branch (`:513-517`, "direct bootstrap seed").
- Minimal schedule: the `service_definitions` leader is not yet elected when `registerMetaServiceDefinitions`
  runs; NOT_LEADER; the phase throws. A retained attempt continues only when no row was written
  (`seed-original-allocation-startup.js:21-47`), so the cluster must be re-founded.
- The author's "the seed failed even with the fallback" is shown for one case: the first `services` INSERT
  (a203b2c36: 1 direct write, `original-allocation-observation-unavailable`, 11.3 s). Whether the arm ever
  rescued a write to an unwaited partition is not established either way [I]; the observer counts the call,
  not its result.
- The "green after" of the refusal witness accepts a failed start; at 12.9 s against 30.3 s the seed almost
  certainly failed [I: passing files print no witness line].
- Single-node specifics: no period needs a direct lane. The first rows are written inside the window, after
  the wait for their four partitions, through each partition's own raft group; the lane calls the local
  partition service and needs no cache. Four lab starts and two GCP seeds show 0 direct writes [V].

### 7. Seed configuration seeding does not observe its writes (pre-existing, outside the diff) [V]
Both GCP seed logs report `Configuration seeding complete` with `seeded: 0, skipped: 72` on a fresh seed while
`config` rows were inserted (run 1 lines 545-546; run 2 line 549). `DynamicConfigService.seedConfiguration`
(`dynamic-config-service.js:193-205`) counts every non-applied answer as skipped and continues. After the
deletion a RETURNED refusal of a config insert would be skipped silently; a thrown one fails the phase.

### 8. Hand-over edits (e5cdc7770) [V]
- `authoritative-row-mutation-vocabulary.js:32, 81-84`: correct and complete.
- `LEADERS_READY` and `CONTROL_PLANE_MESSAGE_WAS_NOT_ACKNOWLEDGED` are defined at their owners; the `||`
  fallback, the local string and the unconsumed copy are gone, with no remaining reference.
- Census at a203b2c36: red for exactly the three router members (lab log lines 68-72).

### 9. Lab evidence by sha, file and case [V]
- 70dfcdba8 (`nw2-red-70dfcdba8-1`): 7 red, seed start green 26017 ms.
- baa2a2580 (`nw2-after-baa2a2580-1`): 20 files planned (the author says 21); the four stage-3 witnesses
  green, seed 27801 ms; red census, raft classifier, provisioning case 3, placement-explicit,
  write-exactly-once.
- 5392380ae: provisioning-deadline 4 assertions green.
- a203b2c36: raft classifier green (133); census and addressInUse red as designed; refusal witness red with
  one direct write; normal start 26979 ms.
- 097888f1a: refusal witness green 12897 ms, normal start 30274 ms (one sample), routing, bootstrap-sequence
  and seed-registration-phase green; five red files, four on `executeQuery is not a function`, the fifth is
  finding 2.

## Conditions
1. (i) Repair finding 1 with a red-first witness (unknown, then a refusal, inside one CDC call) before merge.
2. (i) Decide finding 2 and record it; remove that file from the deletion's fixture list.
3. (ii) Either wait for the leader of every partition the window writes, or record the fail-closed
   re-founding as the owned outcome; repeat the fresh-seed start (one sample at 30.3 s).
4. (ii) Do not land ahead of the four fake migrations.

## Not established
- Finding 1 on a real cluster; that (i), (iv) were green before baa2a2580.
- Whether the fallback arm ever succeeded inside the window (the fence may have refused it).
- Why config seeding reports 72 skipped (finding 7).
