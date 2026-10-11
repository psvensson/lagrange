# Independent BEGIN uncertain-insert source review — round 1

**Verdict: REJECT / REVISE SOURCE.** The frozen implementation correctly carries the private BEGIN consumer through the real request-cell/query-executor wrapper, installs the approved fixed encoding, retains one role-neutral record count across states, and exercises real pg.Client/TCP component paths. It does not implement several approved safety and liveness boundaries. Eight category-complete findings remain. The strongest reproduced failures are: an expired uncertain BEGIN becomes ACTIVE, malformed authoritative state deletes the retained descriptor, an accessor-backed row grants BEGIN success, a retained creation outside the first sweep batch never runs, local acceptance failure emits `CommandComplete`, `ErrorResponse`, and `ReadyForQuery` while the connection survives, and process shutdown can return BEGIN success after removing its only owner.

The approved design remains coherent. This verdict rejects only snapshot `2925863c3e72a17854413fa2c850ce4ff76f6aff` and its live-equivalent dirty source.

## Exact subject, freeze and evidence

- Approved design SHA256: **3679b87f4aeb84fd8d9397aac9f73f686e5fcb990c1e61e86df35e9731f91fa5**.
- Independent design approval SHA256: **c42b12bb01d1167e9b111c7469c458c82f80cc60e013fdcbfb9583313e1f74d6**.
- Worktree: `/mnt/data/peter/projects/.worktrees/rs-raft-startup-integration-20261011`; branch `integration/rs-raft-startup-20261011`; live HEAD/base **c6d71665e98be03de916705f272a9d6340e4a842**; index clean; source remains dirty/frozen.
- Root proof commit: **2925863c3e72a17854413fa2c850ce4ff76f6aff**, tree **cd3a456da300c9cd4c05b44e039700eaa724639a**, parent **c6d71665e98be03de916705f272a9d6340e4a842**, ref `refs/proofs/rs-raft-20261011/begin-uncertain-handoff`.
- `test-output/continuation-20261011/tx-begin-handoff/source-manifest.sha256`: SHA256 **1551f73a970d91b7a8c08b43b72b49d83035e71105c28511eff0c08a3d5aaacc**.
- Manifest audit: **31 paths, 31 unique**; exactly equals the proof commit parent delta and live `git status`; every manifest digest equals both the live blob and `2925863…:<path>`. No missing or extra source path was found.
- `evidence-summary.json`: SHA256 **d9a2747e7285e05cdb8a938c89982a403b59188f030196f7fa5887860706f42a**. `proof-snapshot.json`: SHA256 **599cdc53b9658791f725d19f67c310965bfef9c8468f2afc9b223d8cd6958405**. Every log digest referenced by the summary was independently recomputed and matched.
- Read every production diff, the new test and generated impact/classification metadata. The real wrapper in `request-cell-invocation-owner.js`, executor replacement, pgwire runtime/adapter/handler, application facade, engine lifecycle, DWC failure disposition, persistence reader and recovery sweep were traced together.
- Review diagnostics were written only under `test-output/continuation-20261011/tx-begin-handoff/independent-review/`; no source, test, Quest log, index, design or generated metadata was edited.

## Independent execution

| Command / artifact | Result |
| --- | --- |
| `npm run test:file -- test/query/transaction-begin-uncertain-handoff.test.js` | PASS, 1 file, 98 runner assertions; log SHA256 **75998a4ffaeb8fdeab5df8865bf706d342ee22fbb5d37765cb429d796deeeffb**. The underlying TAP file still reports the packet’s 16 suites/82 assertions. |
| `node test-output/continuation-20261011/tx-begin-handoff/independent-review/adversarial-source-review.mjs` | Completed and reproduced the six semantic failures summarized below. Script SHA256 **8b2015c99d9d0ada3f31fe582c71d35d82df290b80ef68594958d060f09d3755**; log SHA256 **89eaff8e865b4646051207e02025b1daf86ae2bd877542cca09ad85b02c8b6e6**. |
| Packet cumulative/static evidence | Recorded 396/396 assertions, ESLint/complexity/cognitive/impact/shards green; all referenced hashes matched. The global file-size audit remains red at source 29/27 and test 21/21, while touched source remains at or below 797 lines. |
| Broad coordinator comparison | Packet records 35 pass/27 fail on both snapshot and exact base c6 with identical failure locations. This supports “no new failure location” only. It does not make the broad suite green and is separate from the separately reported activation reds. |

## Findings — one complete round

### SR1 — HIGH — record bytes and maximum transition envelope are allocated before capacity is reserved and are undercharged

`reserveTransactionCreationRecord` allocates the complete encoded row and delivery-key string at `distributed-transaction-creation.js:180-187`; only afterward does it test the record count and byte pool at `:188-194`. It then charges `RECORD_FIXED_BYTES + rowBytes.length + keyByteLength` (`:186-201`). The approved P1/R5-1 order requires checked scalar sizing, reservation of the role-neutral slot and **maximum later transition footprint**, then row/key/DWC allocation. The source also retains `tx.sessionId`, `ownerKey`, the frozen initial-row object, encoded buffer, key, consumer and later acceptance-token fields without charging each simultaneously retained variable reference as the design requires. A fixed 256-byte estimate is not the approved exact conservative envelope.

Pressure can therefore allocate the very row/key it promises to refuse before allocation, and admitted records can retain more declared bytes than their token. Compute canonical lengths and all transition representations with checked arithmetic, reserve the slot and maximum envelope first, then allocate once; keep that exact token through every role.

### SR2 — HIGH — operation/attachment accounting does not own the actual retained closures or caller lifetime

The pre-FIFO token records only `sessionId`, byte estimate and invocation number (`distributed-transaction-creation.js:114-141`). `DistributedTransactionCoordinator.begin` nevertheless closes over and spreads the entire `options` object inside the queued reaction (`distributed-transaction-coordinator.js:279-303`). Production `queryOptions` includes timeout budget, cancellation token, budgets, tenant/dialect and security context (`sql-query-engine-request-dispatch.js:100-124`), none of which is charged or cleared. The same token doubles as the attachment counter; `detachDistributedTransactionCreationWaiters` only decrements that counter (`distributed-transaction-creation.js:144-173`). It cannot null the handler/request/Promise continuations that remain retained until the FIFO/gateway work settles. There is also no caller-deadline path that detaches an attachment while keeping its queued operation charged.

This violates the approved fixed operation record, separate caller attachment, pre-FIFO byte ownership and release ordering. Introduce the specified compact captured operation/attachment records, copy only owned scalars, race caller lifetime against the original absolute deadline/close, clear attachment references on detach, and retain the operation charge until the actual FIFO reaction settles.

### SR3 — CRITICAL — reconciliation has no absolute control-turn deadline and can activate an expired transaction

The operation token contains no deadline. `beginStartedAtMs` is used only when a new transaction budget is created (`distributed-transaction-coordinator.js:279-360`); retry and sweep reconciliation call `persistWorkflowState` without capturing or checking a new pre-FIFO control deadline (`distributed-transaction-creation.js:474-526`, `distributed-transaction-recovery.js:272-298`). The INSERT receives the original transaction budget, but the authoritative read receives no timeout budget at all (`sql-query-engine-transaction-persistence-methods.js:247-274,284-296`). No synchronous check prevents `completeReconciledTransactionCreation` from publishing ACTIVE after the original deadline.

The independent `expiredRetry` case used clock 0, original deadline 10 and retry time 100. The retry returned success, installed `ENTERED_ACTIVE`, and exposed an active transaction with `timeoutDeadline: 10`. That contradicts the approved rule that post-expiry control turns may settle recovery debt but never grant transaction activity. Capture one validated absolute reconciliation deadline before every foreground/sweep FIFO enqueue, pass the same deadline-bearing budget to INSERT and read, omit the next call at zero remaining time, and recheck original expiry before any live ACTIVE acceptance.

### SR4 — HIGH — the authoritative reader accepts noncanonical advanced state and invokes result-array accessors

The general reader validates mutable strings only as nonempty/string and decisions only as null-or-string (`sql-query-engine-transaction-persistence-methods.js:122-149`). It does not validate the actual status, participant-set state/text, commit-mode, frozen-count/decision combinations or advanced persisted domain required by P2. Any same-immutable row that differs from the initial row is therefore classified as advanced (`:151-155`). The coordinator removes/releases the exact creation before calling ordinary recovery (`distributed-transaction-creation.js:345-364,366-375`), and recovery rejection is merely logged.

The `invalidAdvancedMutableRow` adversary supplied `status: "NOT_A_STATUS"`; BEGIN returned `TRANSACTION_RECOVERY_INCOMPLETE` but record count/bytes became zero, losing the retained uncertainty owner. Separately, the reader checks `Object.hasOwn(rows, 0)` and then evaluates `rows[0]` (`sql-query-engine-transaction-persistence-methods.js:300-313`) without rejecting an accessor descriptor. `accessorArrayReadback` invoked that getter and granted BEGIN success. Capture the own dense 0/1 result array and row through data descriptors once, validate the complete general persisted domain and combinations, classify malformed input INVALID, and retain the original descriptor.

### SR5 — HIGH — local acceptance failure after CommandComplete leaves a surviving contradictory protocol session

The handler writes CommandComplete before acceptance, as designed, but its whole path is inside one generic `try/catch` (`pgwire-protocol-handler.js:621-684`). `acceptDistributedBegin` invokes `enterLocalBlock` without a guarded restore (`distributed-transaction-creation.js:279-292`). If local entry throws, the exception falls into `_answerFailure`; the outer simple-query path then writes ReadyForQuery because the handler was never closed (`pgwire-protocol-handler.js:597-603,721-727`). The claim remains `SUCCESS_CLAIMED`.

The independent `postTagAcceptanceFailure` case produced message types `["C","E","Z"]`, `socketDestroyed:false`, `sessionClosed:false`, and creation state `SUCCESS_CLAIMED`. This is precisely the design’s prohibited misleading surviving connection. Precheck the exact live handler/session/incarnation before CommandComplete; make claim consumption plus local entry a guarded synchronous transition; on entry throw restore the prior live entitlement only for the current incarnation and destroy/suppress Ready, and on any refusal/throw after the tag destroy without writing another answer.

### SR6 — HIGH — shutdown removal is not fenced after the persistence await, so a removed direct BEGIN can return success

Process retirement removes pending workflows and releases their record tokens (`distributed-transaction-creation.js:306-315`). `DurableWorkflowCoordinator.registerWorkflow` does not recheck that its exact workflow is still installed after `await persistWorkflow` (`durable-workflow-coordinator.js:65-83`), and direct `buildTransactionCreationResult` publishes success without checking either workflow map (`distributed-transaction-creation.js:240-245`).

The independent `shutdownDuringDirectBegin` schedule paused persistence, retired process state, then completed persistence. BEGIN returned success while `getTransaction(session)` was null and all creation diagnostics were zero. Revalidate the exact workflow/map/owner and shutdown generation after every await. A retired direct operation must return a typed shutdown/stale result; it cannot publish success after the only owner and capacity token were removed.

### SR7 — MEDIUM — recovery always selects the same sorted prefix and omits the approved folded diagnostics

Each sweep sorts all retained creation IDs and slices the first configured batch (`distributed-transaction-recovery.js:249-260`). There is no rotating cursor. The independent 17-record/16-batch adversary ran two sweeps: the first and sixteenth records were attempted three times total, while the seventeenth remained at its initial single attempt. A persistently unresolved low-ID cohort can therefore starve every later creation indefinitely.

The owner also exposes only aggregate count/bytes and derived roles (`distributed-transaction-creation.js:317-331`). It neither checks the round-seven per-role-sum invariant synchronously on each rewrite nor emits the approved folded oldest-deadline, selected-count, deferred-attempt/until and canonical stop-reason diagnostic. Add the volatile rotating cursor, advance it for every bounded selection, preserve defer/backoff, and publish the folded invariant-bearing diagnostics once per sweep/defer window.

### SR8 — MEDIUM — strict configuration/arithmetic and required saturation/latch evidence remain incomplete

`initializeTransactionCreationOwner` reads configuration properties directly and accepts an accessor result (`distributed-transaction-creation.js:32-38,92-111`). The independent accessor configuration was accepted and invoked once, contrary to the approved own-data/no-accessor configuration contract. Byte totals and invocation sequence use unchecked additions (`:114-134,175-201`) and role/count decrements have no safe-integer/nonnegative invariant assertion (`:144-220`).

The focused test’s low-cap cases do not fill the global record pool with live entitlements and then prove a new BEGIN refuses before INSERT, nor fill a mixed descriptor/entitlement/application/server-only cohort and resolve every admitted role at constant count/bytes. It also omits the accepted callback-throw/connection-retirement latch, expired-turn nonactivation, rotating-cursor starvation, invalid advanced domains, result-array accessors and shutdown-after-await race. The 82-assertion focused green and 396 cumulative green therefore do not establish the approved transition table. Capture configuration through strict own data descriptors, perform checked safe arithmetic/invariants, and add the real semantic witnesses named above.

## Full 63-item checklist

Legend: **PASS** means this snapshot implements the reviewed item in the inspected path; **BLOCK SRn** maps the item to a finding; **LIMIT** records a proof ceiling rather than a new defect.

| Item | Disposition and concrete evidence |
| --- | --- |
| A1 | **PASS.** BEGIN bypasses ordinary expected-transaction admission only to reenter the coordinator’s raw pending binding; other statements/COMMIT/ROLLBACK use `transactionCreationAdmission` or pending checks (`sql-query-engine-request-dispatch.js:39-52`; `sql-query-engine-statement-admission.js:62-89,113-130`; coordinator `:463-521`). |
| A2 | **BLOCK SR4.** Specific PK evidence is required for immutable conflict and generic/wrong-key/incomplete cases retain, but malformed advanced mutable domains are misclassified as valid recovery state and lose the descriptor. |
| A3 | **BLOCK SR3.** The original transaction budget is retained, but no pre-FIFO reconciliation deadline exists and expired retry can publish ACTIVE. |
| A4 | **PASS.** New pressure/uncertain/recovery results and private symbol token propagation are typed; request, engine and pgwire projections are wired. |
| A5 | **BLOCK SR7.** Foreground plain BEGIN and the existing sweep are reachable; fixed-prefix sweep selection starves later retained IDs. |
| A6 | **BLOCK SR5/SR6.** Normal reconciliation checks the session map before/after persistence, but local-entry throw and shutdown-after-await lack the required current exact-owner fencing. |
| A7 | **BLOCK SR7.** Aggregate diagnostics exist, but exact held identity/oldest deadline/selected/defer state and synchronous role-sum invariants are absent. |
| Y1 | **BLOCK SR7.** The unref timer and foreground retry fire; the sweep repeatedly chooses the same sorted prefix instead of rotating. |
| Y2 | **BLOCK SR3.** Unreadable rows retain the descriptor, but there is no frozen per-turn deadline for INSERT/read after FIFO. |
| Y3 | **BLOCK SR4/SR6.** Ordinary states are typed; malformed advanced rows and shutdown races silently remove the sole creation owner before a valid terminal/live transfer. |
| Y4 | **BLOCK SR2.** FIFO and recovery share one lane, but detached/expired caller continuations are not actually severed or independently owned by the attachment token. |
| Y5 | **BLOCK SR1/SR2/SR8.** Counts exist; actual retained options/caller closures and maximum transition bytes are not completely reserved, and required full-role saturation proof is absent. |
| Y6 | **PASS.** Exact initial bytes/key are reused for redelivery and specific collision alone remints; the fixed vector matches. |
| Y7 | **BLOCK SR3.** Identity is not reminted by uncertainty, but a retry after the original deadline reactivates the transaction and effectively renews activity. |
| T1 | **PASS.** APPLIED or authoritative classification, never transport ACK/noHandler alone, establishes creation. |
| T2 | **BLOCK SR5/SR6.** Exact consumer/token checks handle normal replacement, but post-tag throw and process retirement are not safely linearized against late completion. |
| T3 | **BLOCK SR4.** Producer-specific collision is preserved, but generic mutable strings are treated as canonical advanced state. |
| T4 | **BLOCK SR3/SR7.** Missing gateway/read is retained, but calls are not bounded by one reconciliation deadline and fixed-prefix selection can make a valid owner permanently unreachable. |
| T5 | **PASS with LIMIT.** Real pg.Client/TCP/listener/handler/adapter/engine traces are present, including the production request-cell executor wrapper. They are component traces, not full `startLagrangeRuntime`. |
| S1 | **PASS.** The existing recovery interval is unref’d (`distributed-transaction-recovery.js:380-403`) and no new timer is introduced. |
| S2 | **BLOCK SR3.** Uncertain/claim states themselves grant no COMMIT, but expiry does not fence successful creation acceptance. |
| S3 | **BLOCK SR6.** Socket close and process shutdown are distinct; process retirement can still race an awaited persistence completion and return ownerless success. |
| S4 | **BLOCK SR3.** Slow legitimate settlement is retained, but expiry can grant ACTIVE instead of restricting the turn to recovery debt. |
| S5 | **PASS with LIMIT.** The canonical CRITICAL gateway path and sweep can run while ordinary mutation admission is closed. Full startup remains activation-blocked and is not claimed. |
| R1 | **BLOCK SR4/SR6.** Exact-object map checks protect many stale callbacks; malformed advanced handoff and post-shutdown completion can remove or publish over absent ownership. |
| R2 | **PASS.** Live pending, server-only and durable restart census remain distinct; no undurable cross-process adoption is claimed. |
| R3 | **BLOCK SR4.** Valid advanced rows route toward normal recovery, but the reader neither proves general domains nor preserves the descriptor when that handoff rejects. |
| R4 | **PASS.** Same ID/key/bytes are replayed and exact acceptance is one-use in the normal path. |
| R5 | **PASS.** MISSING alone remains uncertainty and never permits remint/no-effect. |
| C1 | **BLOCK SR1/SR2.** Operation count is acquired before FIFO, but full operation/attachment bytes and record/envelope capacity are not acquired before allocation/retention. |
| C2 | **BLOCK SR3/SR5/SR6.** Exact checks exist after ordinary persistence, but deadline, local-entry failure and shutdown generation are not rechecked at publication edges. |
| C3 | **PASS.** Foreground retry and recovery use the session FIFO and one workflow object. |
| C4 | **BLOCK SR5/SR6.** Close/result ordering is covered for ordinary returns; callback throw and process-shutdown reentry are not guarded. |
| C5 | **PASS.** Session/consumer/claim identities remain distinct from durable transaction ID and request-cell replacement retains the issuing executor. |
| F1 | **PASS with BLOCK SR2.** All production dependencies and the real executor-replacement wrapper are named/wired; the wrapper cannot repair the coordinator’s unowned options/caller closure. |
| F2 | **BLOCK SR7.** Existing census/sweep is independent of cache success, but fixed-prefix retry can strand later retained records. |
| F3 | **PASS.** Same live pgwire session retries the original record; reconnect/new application session uses a new private incarnation. |
| F4 | **BLOCK SR3.** FIFO, INSERT and read do not share one pre-captured control budget; the read has no budget and expired retry can activate. |
| F5 | **PASS.** No raw SQL reader, alternate ledger, retry scheduler, cross-session correlation or forced readiness path is added. |
| H1 | **BLOCK SR8.** The main test engages a lost INSERT response, but the required semantic reds for the reproduced boundaries are absent. |
| H2 | **PASS with LIMIT.** Real engine/gateway and real TCP pg.Client fixtures are used; no full-startup claim is made. |
| H3 | **BLOCK SR3/SR5/SR6/SR7.** Required deadline, callback-failure, shutdown and rotation schedules are missing; independent deterministic schedules fail. |
| H4 | **BLOCK SR2/SR7.** Six fields/15 bytes/key are recorded, but the record lacks the approved invocation-bound WAITING state/control deadline and diagnostics omit exact selection/defer identity. |
| H5 | **BLOCK SR8.** Durable rows and ordinary counters are asserted, but no nonvacuous full entitlement/mixed-role cohort proves constant capacity and single release. |
| H6 | **PASS/LIMIT.** Packet labels docs/source/component proof separately and states startup is activation-blocked. The green counts do not override these source defects. |
| O1 | **PASS.** Persistence classifies, coordinator owns identity/resources, DWC owns generic maps, and pgwire/application own local consumption. |
| O2 | **PASS.** Private consumer/acceptance symbols cross request/engine/runtime without becoming wire or durable authority. |
| O3 | **BLOCK SR1/SR8.** Pressure refusal exists, but it occurs after row/key allocation and lacks the required full-role recovery positive. |
| O4 | **BLOCK SR4.** Stale/wrong-key evidence retains and fresh initial evidence succeeds; malformed advanced evidence incorrectly destroys the retained owner. |
| O5 | **BLOCK SR1/SR2.** Resource priority exists but actual allocation and retained-lifetime ownership do not match the declared bounded tokens. |
| O6 | **BLOCK SR7.** Foreground and timer wakes exist; later IDs can remain permanently outside the fixed selected prefix. |
| O7 | **PASS.** Wire state, error labels, consumer symbol and role diagnostics remain projections/capabilities rather than durable creation authority. |
| O8 | **PASS.** Subject/source/evidence fingerprints and generated impact seal are exact; independent adversarial fingerprints are recorded above. |
| O9 | **PASS.** No implicit autocommit escape, force boolean, raw reader, alternate owner or global barrier was introduced. |
| O10 | **PASS with BLOCK SR8.** Impact contract registers the coupled production endpoints and real tests, but its witness file omits several required transition-table schedules. |
| J1 | **BLOCK SR1/SR8.** Primary configured numbers reject most invalid primitives, but own accessor values are accepted and byte/count/invocation arithmetic lacks checked safe addition and synchronous nonnegative invariants. |
| J2 | **BLOCK SR4.** Row capture uses strict own-data copying, but the result array’s index can be an accessor and is evaluated before strict capture. |
| J3 | **BLOCK SR4/SR8.** Result-array and configuration getters are invoked rather than rejected; scalar capture-before-compare is therefore incomplete. |
| J4 | **PASS.** Strict row-copy/prototype discipline is preserved for the row object itself; this review does not extend to arbitrary hostile host objects. |
| J5 | **PASS.** Canonical producer IDs/modes/numbers and private exact-object tokens reject boxed/exotic producer fields. |
| J6 | **PASS/LIMIT.** No new claim of ambient intrinsic safety is made; the finding is limited to explicit strict-own boundaries required by the approved contract. |
| J7 | **PASS.** Fixed field order, canonical decimal integer text, row prefix and SHA-256 delivery-key vector match the approved bytes. |
| J8 | **BLOCK SR1/SR4.** Row/key allocation precedes reservation, and dense result cardinality checking invokes an index accessor before validation. |

## Required bounded correction

Correct SR1 through SR8 together against the already approved design. In particular:

1. implement strict scalar sizing and reserve the role-neutral slot plus exact maximum transition envelope before row/key/DWC allocation;
2. make operation and attachment records own and clear the actual retained data/lifetime, with one absolute pre-FIFO turn deadline;
3. pass that same budget to INSERT and authoritative read, and prohibit live ACTIVE acceptance after original expiry;
4. strict-capture dense reader arrays and validate the complete general advanced-row domain before releasing the descriptor;
5. make protocol acceptance restore-or-close correctly for every callback/refusal after CommandComplete and suppress Ready on a retired connection;
6. fence every post-await publication against shutdown/current exact owner;
7. rotate bounded sweep selection and publish folded invariant-bearing diagnostics; and
8. add the full entitlement/mixed-role saturation and reproduced adversarial schedules to the real component evidence.

Preserve the working exact encoding, private consumer propagation, request-cell executor replacement owner, specific-collision rule, original identity, valid advanced-row recovery, uncertain ROLLBACK behavior and honest full-startup limitation. The 27 broad coordinator failures remain pre-existing same-location debt and are not relabeled as this snapshot’s regressions or as activation failures.
