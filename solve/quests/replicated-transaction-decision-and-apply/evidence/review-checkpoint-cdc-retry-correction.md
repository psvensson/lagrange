# Independent review: F6/F7 CDC retry and timer correction

Date: 2026-10-11. Reviewer: `subagent:/root/review_checkpoint_composition`.
Author: `checkpoint_implementation_56`. This reviewer changed no source, test,
metadata, index, or Quest log. Reviewer diagnostics and this report are evidence
artifacts only.

## Verdict

**APPROVE the exact eight-path F6/F7 correction. APPROVE the bounded component
source composition for preservation on a non-main checkpoint and further
integration work.** No additional reachable correctness defect was established
in this correction. The original lost read-recovery wake, discarded rejecting
promise child, and referenced host timer findings are closed at this scope.

This is **not approval of operational startup or the complete recovery chain**.
Normal production startup has an introduced admission failure, independently
reproduced by the root's same-host lab comparison. It remains a required owner
repair. BEGIN uncertainty/collision handling, durable activation authority,
remote discovery/current fences, whole-operation resource bounds, integrated
snapshot/startup recovery, two FreshMG replacements, physical recovery, canonical
corpus/static gates and merge acceptance remain open. A component checkpoint
preserves reviewable work; it is not a usable production release candidate.

Earlier bounded F1–F4 corrections, the F5 terminal-evidence correction, and the
snapshot marker adaptation retain their exact scopes below. The eight new paths
do not change their transaction decision, application, release, or marker bytes.
This verdict does not broaden historical a01 or 20b approvals.

## Exact subject and provenance

Paths in this report use these aliases:

- `W`: `/mnt/data/peter/projects/.worktrees/rs-raft-recovery-chain-20261011`.
- `P`: `W/test-output/recovery-checkpoint-20261011/f6-f7-correction`.
- `E`: `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.
- `R`: `E/checkpoint-cdc-retry-review`.
- `L`: `/mnt/data/peter/projects/.worktrees/tx1-work-20261010/solve/quests/replicated-transaction-decision-and-apply/evidence/checkpoint-20261011T1649-boundaries`.

| Identity | Exact value |
| --- | --- |
| Prior reviewed snapshot | `a9c9290bae4e4a882e0317d9a79bd856b9ffc268` |
| Current review snapshot | `c6d71665e98be03de916705f272a9d6340e4a842` |
| Current snapshot tree | `8aa66b3c87f2f7b3839948a6449eb3a5cf74c70b` |
| Worktree HEAD/base | `10c2f0610f2924b8e7773497b03ac95fa4f42e58` |
| Unchanged frozen index tree | `be8cd676baf918aa39e721ebde2678930e93ca4a` |
| Author README SHA-256 | `c8c867694991ad80e1ea8a08dbdd067109eae2bedb19468755411296990bb81a` |
| Eight-path delta manifest SHA-256 | `d89667d219ed175f2581b2a0228f771676f705deac8acd91d6f080db697ac8ae` |
| Full 103-path manifest SHA-256 | `78dc69eee4eec1c42922d63a86cc4226724e7522973ff10c312e030a5ad2c04d` |
| Exact source delta patch SHA-256 | `fa8e2cd24cae578675a70fda372c610373e63a2794621dee15b74d6d665d8340` |
| Author evidence manifest SHA-256 | `ec0b2108685d8d0fc0dd2b87879398dd23c26d558297c11b6c9d573dde9cb84e` |

Independently verified every full-manifest entry against both the live worktree
and `git show c6d71665:<path>`: **103/103 match**. Independently verified all eight
delta entries and that `git diff --name-only a9c9290 c6d71665` is exactly those
eight paths. `sha256sum -c P/evidence-manifest.sha256` passed for every retained
artifact. `git write-tree` still returns the frozen index tree above. The source
snapshot is the review identity; the worktree's older HEAD alone is not.

### Exact delta

All paths are relative to W.

| Path | SHA-256 |
| --- | --- |
| `src/partition/partition-cdc-delivery.js` | `79e1744a62d947ff6bec5950ea9014fbbb5ebbdfa7f5c34bd243069f9838fe52` |
| `src/partition/partition-cdc-obligation-constants.js` | `638f27f202e8c110f905c49a09251f0f1eb5305773f16eb9e2f6d61a012b93a8` |
| `src/partition/partition-cdc-obligation-delivery.js` | `9fd590d3b725b1e657404cc747c3dde3ae6595e380de069e98cbdd5ab7039381` |
| `src/partition/partition-service-cdc-stream-base.js` | `a87c0596b59616807ea1843c590f42dad1e1a4e848c28d25e1c375d5795e5034` |
| `test/partition/partition-cdc-obligation.test.js` | `4c3ebd31760c1008e94b9ce1e1f7718207dc04aecca77fca6cfbfba919aa6f4c` |
| `test/partition/partition-service-shutdown-timers.test.js` | `930011dfdb014643537d634b3b21c6ff5b8786a4abd19db1a890956c27897a76` |
| `test/shards/impact-contracts.json` | `e1bf0ad1f006237adcdefa4a488f0cb0d672568d6359d927332137584af66e0d` |
| `test/shards/impact-graph-seal.json` | `0ac5889772f3ff48d9081d505d17299d9aabb3200e7a64b828c0975d46ddc08f` |

## Decisive evidence and findings disposition

### F6 — transient ledger read, missing retry, and promise rejection: corrected

The original counterexample uses a real PartitionService and SQLite database,
a real committed ordinary INSERT, and the public subscription path. The controlled
Raft port establishes leader/apply state; it does not emulate a cluster. Initial
leadership work is settled before injecting one `SQLITE_BUSY` while preparing
an `_cdc_obligations` SELECT. This matters: a stray initial wake could otherwise
hide the missing recovery wake.

On exact a9, the retained red shows owed=1/delivered=0, no retry armed, no event
after restoring reads and advancing a minute, and an unhandled rejection. Only
the later explicit control wake rescues delivery. Its SHA is
`ee9fcf5f2bacad7d62a1f9ff359e42926b692b05030347e0f65502192de517af`
(`P/cdc-read-failure-red.log`).

On c6d, the independently rerun same diagnostic records:

1. Before the failed wake: original SQL row exists; owed=1/delivered=0.
2. Failure: `ledger_read_retry`, reason `subscription_handshake`,
   `cdc_obligation_ledger_read_unavailable`, `SQLITE_BUSY`, delay 50 ms,
   retry armed. No subscriber receipt and no durable delivery advancement.
3. With reads restored and only virtual time advanced: the original
   `entry:read-failure` is delivered automatically, pending ACK=1, owed=1,
   delivered=0. There is no unhandled rejection. The later explicit wake in
   this diagnostic is a control **after** automatic delivery and delivers zero.
4. The normal flush proposes CDC_DELIVERED; applying that proposed command
   through the controlled production apply path produces owed=0/delivered=1.
   The SQL row remains the same. Registered O20 has no explicit manual wake.

The implementation remains in the existing lane owner. Ledger read errors become
a typed retry using its existing timer/backoff. Malformed JSON, invalid root
shape, and SQLite corruption/non-database codes become an explicit retained
invalid-evidence hold. They cannot be interpreted as an empty ledger or ACK.
The tracker attaches fulfillment and rejection handlers, removes its pending
promise, and reports exceptional completion without creating the old discarded
rejecting `finally` child.

Independent repeated-fault supplement: eleven `SQLITE_BUSY_SNAPSHOT` failures
through the actual ledger read preserve owed=1/delivered=0, zero receipts and zero
ACK proposals. Recorded scheduled delays are 50, 100, 200, 400, 800, 1600, 3200,
6400, 10000 and 10000 ms. Restoring reads then advances the original
`entry:repeat-fault` and its committed ACK to owed=0/delivered=1 without another
SQL execution or manual drive. This closes the concrete risk that each failed
read might reset the backoff. It is a diagnostic supplement, not a registered
normal-startup acceptance test.

### F7 — timer lifetime: corrected

`armFlushDeadline` and `scheduleDeliveryRetry` call the host handle's optional
`unref()`. Numeric injected-clock handles continue to work. Original exact-a9
negative SHA: `b0c797273912ff9359c6653fb216d4c31fc1f7d3ef86baec47d533fabf352fda`
(`P/cdc-timer-refs-red.log`). Independent corrected rerun shows both a sparse
flush handle and a refusal retry handle have `hasRef() === false`. O22 and the
shutdown suite exercise cleanup; reset/shutdown still clear both handles. No
separate retry framework or referenced replacement timer was introduced.

### No new findings in this eight-path review

Invalid evidence remains owed under an explicit hold; transient unavailability
retains a bounded timer and durable debt. Repeated transient attempts are not
capped at a fixed lifetime because the accepted delivery obligation must survive.
The per-lane delay is capped; this is not a claim of a global attempt/log/memory
budget. No changed production predicate rewrites a durable transaction COMMIT,
re-mints its identity, or re-executes its SQL to recreate CDC work.

The hold test covers malformed durable JSON and SQLite corruption; it is not a
new comprehensive schema certification for every possible corrupted event. The
promise handling claim is for native promises and ordinary internal errors from
these owners, not arbitrary hostile thenables, accessors, logger implementations,
or altered host intrinsics.

## Independent execution and evidence fingerprints

Commands executed from W, with outputs in R:

```sh
node --test test/partition/partition-cdc-obligation.test.js test/partition/partition-service-shutdown-timers.test.js
node ../rs-raft-candidate-20261011/test-output/continuation-20261011/checkpoint-interaction-round2-review/cdc-read-failure.mjs
node ../rs-raft-candidate-20261011/test-output/continuation-20261011/checkpoint-interaction-round2-review/cdc-timer-refs.mjs
node ../rs-raft-candidate-20261011/test-output/continuation-20261011/checkpoint-cdc-retry-review/repeated-read-fault.mjs
```

| Reviewer artifact | Result / SHA-256 |
| --- | --- |
| `R/owners.log` | 43/43 tests, seven suites, 1956.167772 ms; `509459887a7b28a689acb02102405bc78dd3622d7f1cdcae8c58e1f16aa3b308` |
| `R/read-recovery.json` | automatic delivery and committed ACK; `797be879b180bdb26545c564a7df9e261d3072e8de5a08f39f46e9bc8075e14d` |
| `R/timer-refs.json` | both handles unreferenced; `802fd2131a996f2fb08d8c2d0b7aedf0cb12efd6e370e2f2eb621bf52d9b26f9` |
| `R/repeated-read-fault.mjs` | diagnostic source; `ddff8186e03eedf4227879b29adaeb16b9ba3aa691f4e51723cd7926bffc85fd` |
| `R/repeated-read-fault.json` | eleven faults then automatic original-event recovery; `fea279ad7bb0654ed03ee5c3a3e191d6a3bf6b157c76bc2c3e277e25a1990b66` |

The two original diagnostic sources remain in
`E/checkpoint-interaction-round2-review`: read-failure SHA
`680894bc117ca2f33a1e595d4cae27bdbca261da2a8aa185cd640bfee2055a97`,
timer-refs SHA `5537b305ef929c10914ab6daeb77e98a5614ce72e1d083d8434a6fffa92373cf`.

Read and fingerprint-verified author evidence, not presented as a second
independent execution: focused 4/4, complete owner suites 43/43, interaction
48/48, tracker rejection selection, ESLint, shard audit and impact audit.
The latter reports 63 contracts/34 coupled pairs and registry digest
`445e5712c41419682c87c1d8348860217f66e6baaa052b5979510477500e7116`;
metadata reports 2,353 tests. Author commands are pinned by
`98f63009dba19d4ae0335de5aa5edf4accdcacec5bfca55f2c04b60eca349b4f`.

Early `focused-first.log` and `focused-second.log` are retained author test
construction failures (wrong prefixed event key and unsettled initial wake).
They are not semantic old-source negatives and are not included in the final
positive population. The two exact-a9 diagnostics above are the semantic
negatives used for this review.

## Composition and retained integration blockers

### Earlier independent scopes preserved

- `E/review-recovery-checkpoint-interaction-round2.md`, SHA
  `72955efe33c2ba3e3e615daa37b111c5c0d94099b12197075eb77ade057a8eeb`:
  F1 real origin installation/application, F2 sealed preproposal execution
  envelope, F3 actual coordinator-settlement receiver/application owner, and
  F4 faithful controlled consensus status were corrected. This new delta
  changes the CDC exception/lifecycle portion of that composition. Actual
  participant data/debt application and settlement semantics remain unchanged.
- `E/review-checkpoint-release-terminal-correction.md`, SHA
  `b5d07f499e83d15ff5c0648bb3f944cc3bd739186df06f524077046ec0d8d906`:
  F5 uses the canonical wire owner for bound terminal evidence. Source SHA
  `904da2c331f1fc522623769c1def7683a108e2b49e1715f3e02778b6c580527c`,
  test SHA `bc67711f88234c158d858fd1a0ad637b5e2207c5e4f7d2c9e6b04574273f32b8`.
  Invalid replies retain the durable COMMIT/identity; legitimate same-identity
  recovery and durable rollback refusal controls remain accepted at that scope.
- `E/review-recovery-checkpoint-composition.md`, SHA
  `44acde2fbf47c9e45b22ee5ca69c0b3741da1c00046e1358abb792fa637fa963`:
  marker adaptation only. An invalid contender cannot overwrite the outstanding
  marker; conflicting post-rename image evidence remains a recovery conflict.
  Marker source SHA `bab76ee45d80cbdd274ca83cf5856bf36013f6c62d570aa45bc95cc57c458bdc`,
  test SHA `5fc0eae78abea99b07e2d807cf2c21b53ea51338b7146e46b1ce463d2ec352f4`.
  Its lifecycle invocation and complete image/recovery acceptance remain open.

### Production startup is a demonstrated blocker

The root's same-host lab packet `L/checkpoint.json`, SHA
`a82b091b774f743d87c4e6ee267482379f07c5c634e3fd3c8e78a08a1998155a`,
was read; the packet and both raw log hashes were independently verified here.
No new lab run was performed by this reviewer.

The unchanged `test/integration/pgwire-command-tag-real-engine.integration.test.js`
and helper bytes run the normal
`startSeamRuntime -> createEmbeddedLagrangeHandle -> startLagrangeRuntime` entry.
On exact a9, registration fails with `participant_transaction_cutover_paused`
through `SeedRegistrationPhase.registerMessageGroup -> CDCIntegrationService.executeSQL
-> executeBootstrapDirectSql`. Candidate raw log SHA:
`01643ef237acae882d1d75cf576eadafe415abb7651eba1035c6d75b80a82e0b`.
The TAP `tapCaught` frozen-error failure is secondary, not the cause of the
startup refusal. On same-host 10c2, 414 correctness assertions pass; raw log SHA
`8a1b9b2702930599ea221888ab8e5e5f1e0efd33d54e4e8277e5a999008bd1cb`.
The observed duration is 242,776 ms against the test's declared 300,000 ms
timeout. As the user corrected after the packet was written, that duration alone
does not establish unacceptable performance or a specific operation-budget
violation; the packet's earlier performance label is superseded. No performance
repair is opened by this review.

The prior source trace agrees: seed registration precedes hydration, but its
ordinary and legacy bootstrap write routes are fenced, with no production
consumer yet establishing/resuming the authorized participant admission state.
The CDC lane can read and ACK already accepted work while ordinary writes are
closed; that does not make seed registration or full startup complete. The eight
CDC correction paths add no activation authorization or bootstrap progression.
The demonstrated a9 startup failure therefore remains unresolved in this source
composition; c6d has not been re-certified through normal startup.

The 23 ordinary-write reds remain integration blockers under that shared startup
problem. This review does not assert that all have an identical individual stack
trace. The separate origin-only success expectation is obsolete because origin
installation alone cannot authorize activation. Do not force admission open or
individually rewrite all fixtures as a substitute for repairing and proving the
production owner. The requested ordinary-client uncertain-BEGIN witness is still
blocked before client startup in the retained lab execution.

### Resource and recovery ceilings

Per partition, the lane has one drive, one page of at most 256 ledger rows,
one retry timer, one flush timer, ACK batches capped at 256 events/64 KiB, and
at most two outstanding ACK commands plus the current batch. The existing
50 ms to 10 s retry progression is retained. Reads pause at page yield and ACK
backpressure. No global message/size limit was raised.

These are not an aggregate memory bound: the ledger `.all()` read materializes
up to 256 event JSON strings before decoding, one supported event can itself be
large, pending keys and retained event windows consume bytes, and aggregate
partition concurrency is not bounded by this delta. Staged operation limits do
not bound expanded row/event payloads. Whole-event size, backlog/transport beyond
16 MiB, serialization/retry copies, retention, transaction-manifest bounds and
colocated hydration allocation remain open under their existing owners. Durable
CDC debt is distinct from cache hydration and cannot be discharged by a cache
scan or metadata projection.

O8/O9 exercise DB close/reopen, committed debt and lost acknowledgement under
controlled leadership. They remain valuable component evidence. They are not the
requested normal-startup saved-authorization/interrupted-snapshot proof, complete
remote census/current-incarnation proof, or physical deployment recovery proof.

## Category-complete review checklist (63 items)

Abbreviations used only in this checklist:

- **Lane**: `src/partition/partition-cdc-obligation-delivery.js`.
- **Delivery**: `src/partition/partition-cdc-delivery.js`.
- **Tracker**: `src/partition/partition-service-cdc-stream-base.js:225-240`.
- **Ledger**: `src/partition/partition-cdc-obligation-ledger.js` and the committed
  application owner in `partition-cdc-obligation.js`/`partition-write-kernel.js`.
- **O-tests**: numbered tests in `test/partition/partition-cdc-obligation.test.js`,
  independently rerun as part of 43/43. These O-numbers are test names, separate
  from checklist item IDs below.
- **Prior interaction**: exact round-two review and its unchanged paths above.

### A — admission and accepted work

| Item | Concrete evidence and disposition |
| --- | --- |
| A1 | PASS. Lane `drivePrecondition`/`drivePage` at 499-524 use the actual ledger and existing leader/subscriber gates. O20 faults the real SQLite prepare boundary, not a replacement recovery helper. |
| A2 | PASS. Lane 536-614 separates unavailable reads from invalid evidence. O20 retries; O21 malformed JSON and O21b SQLite corruption remain owed with explicit `ledger_evidence_held`, no ACK and no periodic retry. |
| A3 | PASS. Lane 449-472 uses the existing timer/backoff; 641-655 resets only after draining. Repeated-read diagnostic proves increasing delays through 10 s. Existing ACK proposal/deadline code and transaction budgets are unchanged. |
| A4 | PASS. Constants name retry/held states and failure codes; Lane returns frozen outcomes. Delivery 129-145 and 676 route normal wakes through Tracker. Exceptional native-promise completion is owned and logged, not mistaken for success. |
| A5 | PASS at component scope. O20 normal subscribe automatically recovers; O8/O9 normal owner leadership/subscription hooks recover retained debt. No claim that the full production startup currently reaches authorized admission; that blocker is above. |
| A6 | PASS. Lane 115-118 and 478-489 check lane/tenure before and after awaited subscriber work; retry callback rechecks at 463/466. O11 rejects old-tenure completion. Read failures cannot manufacture commit or ACK authority. |
| A7 | PASS. Lane 543-555/599-613 logs actual partition, reason, event where known, error and held/retry classification; diagnostics 709-724 project the current lane. No log or diagnostic field authorizes completion. |

### Y — retry and progress

| Item | Concrete evidence and disposition |
| --- | --- |
| Y1 | PASS. Independent original F6 probe and registered O20 deliver the original event after one read fault using the scheduled retry, with no new SQL write/manual drive. The diagnostic's later explicit control wake follows successful automatic delivery. |
| Y2 | PASS. O20 and repeated-read evidence inspect nonempty owed=1/delivered=0 during read failures and zero ACK proposals. Neither read exception path deletes or marks durable rows. |
| Y3 | PASS within the internal native-promise/error contract. Lane's outer catch returns typed retry/hold; delivery failures use their existing classification. Tracker rejection regression proves removal, one diagnostic and no discarded rejecting child. Logger/hostile-thenable exceptions are outside this contract. |
| Y4 | PASS. Existing retry callback first retries ACKs then drives; flush uses its own deadline. Independent recovery progresses delivery then a normal proposed/committed ACK; O14 covers uncertain ACK retry without new traffic. A read fault cannot starve ACK progress by resetting all lane state. |
| Y5 | BOUNDED PASS / explicit ceiling. Constants retain 256-row pages, 256-event/64 KiB ACKs, two outstanding commands and single timers. Read-fault attempts/logs are rate-limited by backoff, not lifetime-capped; no global process byte/partition/log-retention bound is approved. |
| Y6 | PASS. Independent SQL row/debt snapshots, O2/O9/O16/O20 and repeated-read event keys show replay of durable identity. The new error path never calls SQL execution to reconstruct an event. |
| Y7 | PASS. Eleven-fault diagnostic proves delays do not restart at 50 ms on every failure. Lane has no read-fault path that re-mints event/command identity, expires owed work, or rewrites transaction decisions. |

### T — request, response and transport

| Item | Concrete evidence and disposition |
| --- | --- |
| T1 | PASS. O3/O7/O15 and O20 distinguish subscriber acceptance, proposed ACK and committed CDC_DELIVERED. The row stays owed after receipt and until application. Transport acknowledgement alone does not mark delivery. |
| T2 | PASS. O11 old-tenure completion cannot acknowledge a new lane; O7 rejects unknown/wrong ACK evidence; O14 retries an unknown result with the same command. The new catch adds no late-reply settlement path. |
| T3 | PASS. Lane 568-576 accepts primitive SQLite code strings, normalizes extended codes for corruption/non-database refusal, and otherwise retries. Extended `SQLITE_BUSY_SNAPSHOT` is independently exercised. Owned malformed-event code becomes held, not success. |
| T4 | PASS for retained owner behavior. No database/shutdown/nonleader return explicit states at Lane 499-506; absent subscribers do not drain obligations. Existing bounded proposal failure handling is unchanged. No new network handler or transport promise of delivery is introduced. |
| T5 | PASS with explicit ceiling. Fixtures use real PartitionService, SQLite, public subscribe and production committed apply, with controlled Raft proposals/status. They prove owner/apply semantics, not remote transport, real election, production activation or a full restart deployment. |

### S — lifecycle and timers

| Item | Concrete evidence and disposition |
| --- | --- |
| S1 | PASS. Lane 126-127/249/471 unrefs actual host handles, preserves injected numeric handles. Independent real-time probe and O22 cover flush/retry; shutdown tests cover cancellation/idempotence. |
| S2 | PASS. Lane currentTenure/laneIsCurrent and existing ACK proposer leader checks remain sole tenure gates. O11 proves leadership loss during subscriber await cannot authorize an ACK. |
| S3 | PASS at owner scope. Lane reset discards JS pending/batch/timers; Ledger retains debt. O8/O9 close/reopen SQLite and recover original identities. Full process startup ordering remains open and is not equated with this witness. |
| S4 | PASS. Transient faults retain pending delivery and retry rather than permanently holding merely because one read failed. Permanent malformed/corrupt evidence retains debt under explicit hold. Existing ACK uncertainty survives timeout; no accepted work is dropped on expiry. |
| S5 | PASS at existing owner boundary. Ledger reads and committed CDC_DELIVERED use recovery/application paths, not ordinary mutation admission. Prior interaction and O20 verify actual application. Seed registration's ordinary-write dependency remains a separate demonstrated startup blocker. |

### R — replay and durable state

| Item | Concrete evidence and disposition |
| --- | --- |
| R1 | PASS. Changed error branches modify only their lane bookkeeping/diagnostics and schedule canonical reentry. They make no durable data/debt/transaction update. Current-lane checks guard subscriber completion; old lane results cannot overwrite new durable progress. |
| R2 | PASS. Live retry retains the lane scan and identity; reset/reopen constructs a new lane and rereads durable debt. O8/O9 and Lane 142-150 cover the distinction. No process-local reset grants fresh-storage authorization. |
| R3 | PASS. O20 and independent probes begin with an actual SQL row and one owed event. O21/21b retain that nonempty debt on failure. Assertions are not vacuous empty-ledger success. |
| R4 | PASS. O7 ACK replay is idempotent; O9 lost ACK preserves event identity; O14 unknown proposal retries its original command. The eight-path delta leaves committed participant/transaction replay logic and prepare coordinates unchanged. |
| R5 | PASS. Failed tail/page reads enter typed retry/hold rather than `drained`; both independent fault probes preserve debt. Missing authorization/BEGIN uncertainty still cannot be inferred away from this CDC result. |

### C — concurrency and ordering

| Item | Concrete evidence and disposition |
| --- | --- |
| C1 | PASS. Lane 683-701 retains one in-flight drive and a rerun flag. Retry/flush reuse the current owner and pending maps; no parallel delivery engine or second durable authority appears. |
| C2 | PASS. Lane 483-489 checks tenure and subscriber membership after await; 463/466 gates retry continuation. Error completion affects the old lane or schedules the current owner's canonical wake, never applies a stale acknowledgement. |
| C3 | PASS. One ledger/application owner decides delivered; one lane batches ACKs and suppresses pending duplicates. O3/O7/O10 demonstrate committed settlement, idempotence and repeated leader activation. |
| C4 | PASS at tested interleavings. O10/O11/O14 and shutdown timer tests cover repeated leader notice, late subscriber completion, uncertain ACK and shutdown. Single timers plus lane checks are retained. No exhaustive arbitrary event-loop interleaving proof is claimed. |
| C5 | PASS. Lane belongs to a specific PartitionService and leadership tenure; durable event identity retains entry/transaction and ordinal; ACK includes group/position/digest under unchanged Ledger rules. No cross-partition/global retry cache was added. |

### F — production composition

| Item | Concrete evidence and disposition |
| --- | --- |
| F1 | PASS. Four production changes are delivery caller, lane, constants and promise tracker. Actual ledger reads, subscriber invocation, ACK proposer and committed apply remain their existing owners; exact eight-file diff contains no hidden schema/storage/transport repair. |
| F2 | PASS. Settled-leadership read-failure diagnostic proves no dependency on another user write or manual wake. Durable debt is read from SQLite, independent of an unhydrated volatile event cache. |
| F3 | OPEN, blocking startup acceptance. Root lab packet and prior source trace demonstrate normal seed registration is paused; predecessor passes 414 correctness assertions in 242,776 ms. Duration alone is not a performance failure. No supported activation consumer was supplied by this correction. Do not relabel 23 write reds as harmless fixtures. |
| F4 | PASS for this delta. No new operation budget is created. Existing per-ACK proposal deadline and finite per-drive page work remain; ongoing durable-debt retry is background obligation recovery, not renewed client transaction time. Whole-startup deadline ownership remains an activation integration obligation. |
| F5 | PASS. No force-open call, alternate ledger, fake ACK, trigger disabling, raw Raft escape or origin-only readiness workaround appears. Prior F5 terminal validator correction is unchanged. |

### H — evidence fidelity

| Item | Concrete evidence and disposition |
| --- | --- |
| H1 | PASS. Original diagnostic settles initial leadership before injected SELECT failure; exact-a9 red reaches actual owed debt, subscription wake failure and no retry. Corrected green reaches the same boundary. Early author fixture mistakes are separately retained and not used as semantic negatives. |
| H2 | PASS. Real SQLite and PartitionService handle ordinary committed data, owed row, subscription and ACK apply. Controlled Raft port is disclosed. Lab normal-startup evidence belongs to root and is not relabeled as this reviewer's execution. |
| H3 | PASS. O20 settles post-commit work before public subscription and uses injected time; the original diagnostic waits out initial leadership work. Real-time timer probe separately checks host refs. Recovery is not manufactured by a stray late initial wake. |
| H4 | PASS. Current fixture retains applied index, committed config and lifecycle fields repaired in F4. O20 records reason/failure code/delay plus event key, SQL row, owed/delivered counts and proposed command. Tests do not omit the identity deciding advancement. |
| H5 | PASS. Independent before/after data and nonempty debt are recorded; ACK proposals are checked separately from delivered flags; original and tracker witnesses observe no unhandled rejection. Repeated-fault supplement records zero proposal/receipt until reads recover. |
| H6 | PASS with explicit ceiling. Full 103 live/snapshot byte checks, exact delta, retained review hashes and independent 43/43 are listed above. These do not certify production startup, BEGIN uncertainty, whole-memory bounds, physical recovery or main. |

### O — ownership and operational obligations

| Item | Concrete evidence and disposition |
| --- | --- |
| O1 | PASS. Participant/ordinary application writes data and durable event together; committed CDC_DELIVERED alone settles debt. Lane retry and Tracker do not become storage/decision owners. Prior interaction plus O1/O16 atomicity tests remain applicable unchanged. |
| O2 | PASS. Lane owns typed routine read retry/invalid hold; Tracker owns unexpected native-promise completion diagnostics/cleanup; Delivery routes normal leader/subscription wakes through it. No second terminal-evidence predicate or new CDC durable owner is introduced. |
| O3 | PASS. Same c6d candidate passes transient O20, malformed O21 and corruption O21b, plus tracker rejection handling. Invalid evidence is retained and valid recovery succeeds through actual owner paths. |
| O4 | PASS at lane scope. O11 stale-tenure refusal and O8/O9 fresh owner reentry use the canonical durable ledger; O20 restores readable state and automatically reenters. Permanent invalid hold is retained for that lane, not silently cleared by an ordinary retry; lifecycle reset rereads evidence. |
| O5 | PASS within known bounds. Existing ACK backpressure and timer backoff are unchanged; repeated-fault witness confirms capping. Global memory/whole-event/manifest/retention obligations remain explicitly open above. |
| O6 | PASS. Delivery's leader and public subscription hooks call the tracked owner; Lane ACK settlement and retry timer provide continuation. Original F6 and registered O20 prove the formerly lost wake remains alive without new traffic. This does not assert normal startup can reach those hooks. |
| O7 | PASS. `lastDrive`, logs and metrics describe retry/hold; only committed ledger application changes delivered. Neither absence of a diagnostic nor a `drained` projection clears a durable row. |
| O8 | PASS. Exact source manifest, snapshot/tree and positive/negative fingerprints are recorded. Negatives are exact a9; current independent positives are c6d. Early test construction failures and root lab observations are separate populations. |
| O9 | PASS. Searched/read normal leader/subscribe/tracker callers and lane retry/flush paths. Existing retry framework is reused; no new raw apply/fallback/volatile-emission shortcut appears in the correction. Previously restored owned TX/request/apply chain remains unchanged. |
| O10 | PASS. Existing transaction/CDC impact contract includes the two changed tests and owner prefix; shutdown tracker test is added to that contract. Existing shard membership is retained, generated seal matches c6d and author audit logs are fingerprint-verified. No unregistered new acceptance test file is presented as closure. |

### J — JavaScript boundary and representation

| Item | Concrete evidence and disposition |
| --- | --- |
| J1 | PASS. Retry uses finite positive hint or inherited delay, integer floor and existing 1..10000 ms cap. Repeated-read test exercises doubling/cap. Safe ACK positions/digests/count validation is unchanged under Ledger; no new arithmetic on durable indices is introduced. |
| J2 | PASS at actual boundary. New classification consumes internal Error/SQLite error codes; returned state/failureCode are owned constants. Public event/ACK identity remains overridden from the durable row and validated by existing Ledger/application owners. This is not a new untrusted object-admission API. |
| J3 | N/A for a new hostile-accessor contract. New handlers receive ordinary internal/native errors; they do not claim a captured immutable remote error descriptor. Event JSON is parsed once per attempted delivery. Existing canonical command/reply capture boundaries are unchanged. |
| J4 | PASS. No canonical transaction/ACK prototype/own-field guards are weakened. Added parsed-event root check rejects null, primitive and array values. Full arbitrary object/prototype event-schema hardening is not asserted by these local error corrections. |
| J5 | PASS. SQLite classifier accepts primitive string codes; malformed event roots are rejected explicitly. Success is a typed state and committed ACK, not error truthiness. Noncanonical/unknown error codes take the retaining retry path, never authorize progress. |
| J6 | N/A to a new intrinsic-hardening guarantee. Native Promise, JSON and ordinary logger/timeSource contracts are unchanged; optional host unref is tested on actual Node handles and injected clocks. No claim covers adversarial thenables or replaced intrinsics. |
| J7 | PASS. Event key, entry ID, committed log index/ordinal, ACK digest serializer and transaction decision byte forms are unchanged. Independent original-event recovery plus O2/O5/O7/O13 cover stable identity and bounded ACK digests. |
| J8 | OPEN aggregate-byte ceiling, no regression claimed. Ledger read remains 256 rows via `.all()`; decoding/retained payload bytes and total concurrent partitions are not globally bounded by this delta. ACK limits are real, but do not establish whole-event, backlog, manifest or process memory acceptance. |

## Final integration direction

Preserve this exact reviewed component checkpoint on a non-main branch. Repair
the demonstrated shared normal-startup authorization/admission dependency through
its existing production owner before changing individual ordinary-write fixtures.
Keep pending BEGIN evidence and resource work explicit. Then obtain normal
startup/restart witnesses with saved authorization, interrupted snapshot recovery,
original CDC delivery and lost ACK, concurrent hydration/commit/ACK ordering, and
current complete remote evidence. The two replacements and physical survivor
acceptance remain later gates against the resulting exact candidate.
