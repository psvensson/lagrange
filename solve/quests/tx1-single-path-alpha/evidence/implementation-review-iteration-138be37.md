# Independent implementation review — iteration 138be37e

Verdict: **REVISE for this iteration**. The legacy executor deletion and the inspected current apply/replay/release/cadence changes are coherent, but this iteration has the ingress, mutable-intrinsic, removal-custody and owner-registration defects listed below. Final candidate bytes and final proof are still pending. This is not independent approval, Quest landing approval, main certification or full TX1 acceptance.

Reviewed immutable tree: `/tmp/session-worktree-FRmOD3/tree`, clean HEAD `138be37e6d07706bb71a4ac55aaed77ba0ef06e6`; predecessor `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f`. Source was read, including existing owners and production transport producers; no source, tests or Git state were edited and no new test execution is represented by this report. Evidence reported by the root remains separately identified from source inspection.

Content bindings:

- Approved design SHA256: `cfcb44237c9a87593dea8aa77a6c442b56e5b5685a50591f0804a12c64800d29` (`solve/quests/tx1-single-path-alpha/design.md`).
- Reviewed sealed Quest SHA256: `3a74093d506ec9ec457748976b06e4145b3c7258c588b1e53f2f13894803de53` (`solve/quests/tx1-single-path-alpha/quest.json`).
- Reviewed iteration alpha witness SHA256: `3fe450610085947543d2cda732facdf64e395de474171a1ffb5d7deef4fd7a28` (`test/partition/partition-tx1-single-path-alpha.test.js`).
- Design review: `solve/quests/tx1-single-path-alpha/evidence/design-review.md`; the design approval is not transferred to new implementation bytes.

The authority is the human alpha single-path closeout of 2026-10-13, followed by the sealed five-receipt Quest and approved design. The eight parent receipts are not rewritten or discharged by this child. All seven sealed verification categories are reviewed below. APPROVE means the named component/item passed this source inspection; pending proof is explicitly named and never treated as green.

## Consolidated findings and correction set

1. **adversarial-js-intrinsics / admission-gating — REVISE, known root finding.** `partition-participant-transaction-request.js:136-137` calls mutable `REQUEST_IDENTITY_FIELDS.some`. Replacing `Array.prototype.some` with a function returning false classifies a partial current identity as ORDINARY. Use a primitive/captured scan inside the existing request owner and measure the mutation at real ingress. Freezing the field array does not freeze the prototype method.
2. **adversarial-js-intrinsics / harness-fidelity / owner-interaction — REVISE.** Production registers `handleTransportMessage` (`partition-service-raft-init-base.js:411-412`), but it reads raw `envelope.payload` and then calls the raw Raft classifier (`partition-service-entry-apply-base.js:246-248`; `src/raft/raft-packet-utils.js:11-22`) before strict extraction. The iteration getter/proxy tests use fixture `send` at the application boundary, so they do not pin the registered boundary. Perform the same canonical strict extraction before the classifier, once, preserving legitimate direct/Router/message-group wrappers and semantic Raft packets. Test registered-handler payload/type/proxy negatives with zero reads and direct/one/two-wrapper application and Raft positives. Production packet evidence: `src/raft/raft-rs-peer-delivery.js:98-104`, `src/transport/message-router-inbound-dispatch.js:460-470`, `src/message-group/message-group-service-outbound-dispatch-runtime-methods.js:70-80` (plain own-data wrappers/packets); fixture boundary: `test/test-helpers/participant-transaction-fixture.js:486`. Root authorized this current boundary correction; it is not a compatibility shim.
3. **admission-gating / owner-interaction — REVISE, resolved instruction pending implementation.** Removal admits every full current-shaped QUERY because `ownsParticipantSessionQuery` only tests non-ORDINARY (`partition-participant-transaction-request.js:637-639`; entry caller `partition-service-entry-apply-base.js:302-312`). The approved contract preserves exact current volatile-session custody for valid current QUERY; malformed/collision traffic reaches its typed current refusal. Full valid identity without that session must retain the removal refusal. No ordinary SQL bypass was found, but the current iteration broadens admission and changes typed refusal/counting. Root instructed the writer to restore the existing exact-session criterion and pair absent-session with held-current behavior in a witness.
4. **owner-interaction — REVISE, registry work pending.** Moved removal-serving, participant-transaction-cadence and leader-activation modules have no iteration impact-owner entries; the alpha witness is in top-level test sets but absent from the coordinator/participant pair `witnessTests` (`test/shards/impact-contracts.json:1040-1054`). Carry the moved responsibilities into their actual contracts/endpoints and primary witness classifications. Generated classifiers retain the deleted handler test (`primary-classes.json:1300`, `resource-classes.json:1299`, `subsystem-classes.json:1319`) and deleted transaction-base owner (`subsystem-classes.json:5001`); regenerate from the owning producer.
5. **owner-interaction / executable-removal receipt — REVISE, census cleanup pending.** Dead `DEFAULT_TRANSACTION_SESSION_ID` remains declared/exported (`partition-service-shared.js:221,253`); old-only SQL constants `BEGIN_IMMEDIATE` and `SAVEPOINT_PREPARE` remain (`partition-service-constants.js:87-88`); the README assigns authority to the deleted handler (`src/partition/README.md:29`). Remove orphan historical surfaces and check other old-only SQL constants by actual consumers. Retain current wire BEGIN/PREPARE and legitimate SQL/public homonyms.
6. **harness-fidelity / owner-interaction / concurrency — required final proof, already sent by root.** The iteration alpha witness imports new `participantTransactionActive` (`test/partition/partition-tx1-single-path-alpha.test.js:15-16`), so reverting production alone to baseline would fail import rather than behavior. The final unchanged witness must use a baseline-existing observation seam and fail named behavior assertions on source-only revert. Also finish PREPARING-before-apply collision, same-session ordinary after terminal, actual current-table existence (iteration `tableRows:62-65` maps absent to zero) and exact removal-custody pairs. These are consolidated known gaps, not new discoveries here.

No further deletion regression was found in the current replicated apply/store/staging/CDC owners, ordinary query epoch/leadership order, durable mirror resumption, canonical release-work shape or retained hold cadence. This statement is bounded to inspected iteration bytes; it does not replace final locked-lab proof.

## 1. admission-gating

| Item | Verdict | Evidence and disposition |
| --- | --- | --- |
| Same-state precheck/enforcement | REVISE | Query classification and enforcement share `participantQueryClassification` (`request.js:130-148,623-627,652-661`) and canonical `identityRefusalOf` (`bytes.js:87-96`). Volatile/durable collision uses the session owner (`session.js:105-108`). Removal's full valid QUERY criterion currently exceeds custody (finding 3). |
| Transient versus hard refusals | APPROVE source | Existing typed `refusalOf` and retry handling remain (`request.js:151-179,325-340`); `CUTOVER_PAUSED` direct-mutation refusal remains deferRetry (`local-mutation-admission.js:26-31`); valid write epoch evidence remains deferred/typed (`remote-query-methods.js:40-60,251-265`; alpha witness:215-241). Identity/foreign binding stays hard in the existing identity owner. Exact removal refusal correction is pending. |
| Existing budgets | APPROVE source | Core retains configured/default `preparedStateHoldTimeoutMs`, sweep interval and pending request timeout (`core-base.js:177-188,233-237`). Current queue/write owners are unchanged. Removal's existing 10ms poll/default optional positive interval was mechanically moved (`removal-serving-methods.js:15-20`); no new deadline, enlarged budget or wait introduced. M1 exhaustion is separately red. |
| Reason/envelope shape | APPROVE source, ingress proof pending | TRANSACTION delegates to current router; QUERY identity answer is acknowledged true plus existing refusal (`request.js:580-585,623-627`); invalid outer record yields application INVALID_MESSAGE (`entry-apply-base.js:264-274`). `remoteQueryAnswer` preserves typed write fields (`remote-query-methods.js:85-100`). Registered ingress is still unsafe before this envelope (finding 2). |
| Hold release and event | APPROVE source, final phase witness pending | PREPARE completion ends volatile session only after owned answer (`request.js:325-340`); bound decision moves durable row and schedules reservation readmission after commit (`apply.js:381-384,433-458`). Session deletion checks exact object (`session.js:136-140`); committed-entry event remains after commit (`apply.js:630-635`). Alpha removal witness:291-338 observes bound decision and drain; terminal routing phase is pending. |
| Freshness | APPROVE source | No new cache: current collision queries live session map plus current PREPARED owner (`session.js:89-108`); activity combines live staging/reservation once (`session.js:127-128`); release reads current work after committed membership/status reads (`release-facts.js:46-59,89-110`). PREPARING witness pending, source protection includes it. |
| Honest blocked identity | APPROVE source, registered proof pending | Current refusal carries safe own-data request identity through `answerOf` (`request.js:151-159`), exact `participantIdOf(transactionId,partitionId)` mismatch is retained (`bytes.js:94-96`). Query collision is typed IDENTITY_REQUIRED for the actual blocked routing session, not invented success. Raw transport reads remain finding 2. |

## 2. recovery-replay

| Item | Verdict | Evidence and disposition |
| --- | --- | --- |
| No stale recovered-state clobber | APPROVE source | Legacy reconstruction/local expiry/outcome producer and maps are deleted in the manifest. Current recovered writes remain store origin CAS (`store.js:118-120`), generation single-row update (`129-131`), participant inserts and decided PREPARED CAS (`243-258`), committed outcome/cursor ownership and CDC obligations (`entry-apply-base.js:602-654`; `apply.js:400-441`). Mirror recovery is retained (`leader-activation-methods.js:109`; existing split-mirror-queue resumer). No deleted map is replaced with guessed current state. |
| Restart versus live discriminator | APPROVE bounded source | Current durable PREPARED rows are consulted on live admission as before (`store.js:140-153`); volatile sessions are leader-local and discarded on demotion (`session.js:148-155`). Mirror resumption consumes its existing durable/live-worker owner. Removal of old reconstruction is not restart evidence or new recovery policy. False-positive reservation can delay work; it cannot infer a terminal outcome. |
| Lost enlistment is never success | APPROVE unchanged owner | Coordinator/recovery production files are absent from the source diff; retained primary evidence binding and coordinator-restart tests remain registered. Participant absent outcome remains UNKNOWN (`store.js:271-279`), not an empty success. Missing C2 ACK-owner integration is independently documented by root and not repaired by this child. |
| Replay/idempotence including rollback | APPROVE source | SQL settled outcome is checked before reservation/execution (`entry-apply-base.js:610-621`); txop outcomes and operations run in the existing nested application transaction (`apply.js:400-409`); decision replay is unchanged (`apply.js:462-467`); rollback moves PREPARED under store CAS (`445-458`; `store.js:243-258`). Unknown old marker types now fail typed closed before dispatch (`entry-apply-base.js:571-583`). |
| Absence/unreadability proves nothing | APPROVE source | Participant absence is explicit UNKNOWN (`store.js:263-279`); release work validation throws on unavailable queue/index facts and release returns UNAVAILABLE (`release-facts.js:46-53,113-114`). Removed legacy counters are absent from the canonical shape, not defaulted zero (`55-65`). Old snapshot-log scan deletion does not establish current application snapshot custody (`snapshot-checkpoint-store.js:302-312`; snapshot cadence retains current unsupported authority). Table-absence witness correction remains finding 6. |

## 3. sweep-timer

| Item | Verdict | Evidence and disposition |
| --- | --- | --- |
| Injected time/timer lifecycle | APPROVE source | Cadence receives injected `timeSource.now`, uses its interval/clearInterval, starts once, refuses after shutdown, unrefs and clears (`participant-transaction-cadence-methods.js:20-41`). Default synchronous method accepts explicit nowMs (`15-17`). Lifecycle start/stop hooks are retained in raft-init/lifecycle. |
| Role/authority/SOLO | APPROVE source | Current volatile discard applies on any role without SQL, as before (`session.js:158-174`); PREPARED reporting does not decide (`177-199`). Fitness's role/SOLO logic is moved unchanged; no local rollback/heal survives. No new decision driver or authority carveout was added. |
| Crash-equivalent memory cleanup | APPROVE source | Expiry/demotion removes only current volatile staging (`session.js:148-174`); PREPARE inFlight owns its committed deadline and cannot be swept (`165`). Durable PREPARED state remains until a committed bound decision. No partial old healing execution is retained. |
| Legal windows versus detector | APPROVE source | HoldTimeoutMs remains the existing owner config (`session.js:215`; core:177-188); PREPARED over-window is reported once, never terminalized (`session.js:179-199`). Native A3/A4 injected clock controls are distinct from healthy M1 timeout exhaustion. No budget increase or detector suppression was found. |
| Cadence/starvation/circular waits | APPROVE source | Tick preserves sweep then fitness then snapshot order (`cadence-methods.js:29-34`), single timer and existing snapshot single-flight owner; current sweep is synchronous finite owner reads/iterations. Decision releases reservations directly after commit (`apply.js:383-384`), so a sweep is not the correctness repair. Existing removal polling depends on owned completion and introduces no new cycle. |

## 4. concurrency-serialization

| Item | Verdict | Evidence and disposition |
| --- | --- | --- |
| Synchronous gate plus durable backstop | APPROVE source; phase proof pending | BEGIN's no-await activity gate uses one current composition (`request.js:295-312`; `session.js:127-128`). Query collision sees all volatile phases plus durable PREPARED (`session.js:89-108`). Final witness must observe PREPARING before proposal applies (finding 6). |
| Check/await/use | APPROVE source | Query early/refined enforcement and valid epoch/leadership gates execute synchronously before ordinary execution await (`remote-query-methods.js:251-278`). PREPARE seals owned bytes before proposal and apply rechecks carried generation/decision evidence (`request.js:330-355`; `apply.js:416-450`). Removal fence is monotonic and drain rereads after each await (`removal-serving-methods.js:7-20`). Activation rechecks shutdown/leadership inside existing gate (`leader-activation-methods.js:90-98`). |
| Single winner | APPROVE unchanged owner | Existing sealed prepare/inFlight and immutable decision/apply/outcome owners remain; no new recovery wake or retry driver appears. Store decided transition must move exactly one PREPARED row (`store.js:243-258`), committed SQL settled outcome suppresses replay (`entry-apply-base.js:610-617`). |
| Timer interleavings | APPROVE source | Sweep skips inFlight PREPARE (`session.js:165`), timer is single lifecycle-owned instance (`cadence-methods.js:20-41`), terminal durable decision/readmission is application-owned. Timer cannot roll back durable prepared work. Removal contract deviation is admission finding 3 rather than a timer repair. |
| Actual resource identity | APPROVE source | Sessions keyed by service and participantId with transactionId match (`session.js:77-79`); routing collisions additionally match actual sessionId (`89-108`). Durable reservation is partition-owned (`store.js:140-153`). Unrelated routing seed positive exists (`alpha witness:247-289`); post-terminal same-session proof is pending. |

## 5. owner-interaction

| Item | Verdict | Evidence and disposition |
| --- | --- | --- |
| One semantic owner | APPROVE source structure, boundary fix pending | Identity: bytes owner; activity/collision: session plus store owner; query classification: request owner; routing/epoch: remote-query service façade; release facts: release-facts owner; committed apply: current apply/write/CDC owners. Engine/session mixins, standalone handler and old marker apply are deleted. Transport correction must consume the same strict extraction, not create another interpretation (finding 2). |
| Typed seam / authority | APPROVE source | Intent routes current identity then existing request gates; durable apply decides carried evidence (`bytes.js:87-96`; `apply.js:416-459`). Release facts consume membership/status/generation and accepted-work owners (`release-facts.js:85-115`). Local-mutation refusal retains origin/pause distinction (`local-mutation-admission.js:26-31`). No diagnostic snapshot becomes a permit. |
| Paired invariant / source-revert | REVISE proof | Alpha witness pairs zero effects with ordinary routing and valid-current epoch behavior (`74-108,171-185,215-241,247-289`). Root's original red shows expected assertion failures (`evidence/red-single-path.tap:185-246` and earlier cases), not setup. Unchanged final witness/source-only revert still pending; new helper import is invalid A/B in this iteration (finding 6). |
| Stale then fresh | APPROVE source; final phase proof pending | Classifier rereads volatile/durable custody; sealed completion clears session, committed terminal row clears PREPARED reservation (`request.js:338-339`; `apply.js:433-458`). Epoch freshness logic is moved mechanically and full valid query retains gate order (`remote-query-methods.js:164-265`). Final PREPARING→PREPARED→terminal routing pair pending. |
| Pressure/backoff | APPROVE unchanged source | Current proposal queue/kernel retryable refusal remains owner-controlled (`request.js:325-340`); current pending request/outcome budgets are retained (core:233-237). No force bypass, enlarged timeout or fallback success appears. |
| Owned wake/release | APPROVE source | Bound decision schedules `readmitReservedWrites` after commit (`apply.js:381-384,433-458`), exact session completion deletes current session (`session.js:136-140`). Removal observation polls canonical work, but no polling loop supplies a missing durable decision or release. |
| Projections do not authorize | APPROVE source | Diagnostics/cadence changes are attribution only; release evidence reads live owners and typed unavailable facts (`release-facts.js:89-114`). No old counter/marker projection is promoted. |
| Treatment fingerprints | REVISE proof | Iteration commit, Quest/design/witness hashes are bound above; root-reported 12 files/115 assertions are iteration evidence only. Final manifest, unchanged-test source-only revert and locked-lab final proof are not yet bound. Expected reds and healthy M1 exhaustion must remain excluded from green. |
| No duplicate predicates/raw-read repair | REVISE boundary; otherwise APPROVE source | New activity composition is centralized in `session.js:127-128`; consumers call it. Classification calls canonical identity; no alternate transaction executor remains. Transport still raw-reads before safe owner (finding 2); removal's non-ORDINARY predicate changes custody (finding 3). No snapshot-local log inference was added. |
| Registry/live endpoints/witnesses | REVISE | Findings 4 and 5: moved owner modules and pair witness must be aligned; generated stale references/README/dead aliases must be removed through producer/census. Source deletion alone does not discharge registered ownership. |

## 6. harness-fidelity

| Item | Verdict | Evidence and disposition |
| --- | --- | --- |
| Behavioral source-revert red | REVISE pending | Original four baseline cases fail their stated assertions (`evidence/red-single-path.tap`, summary:242-246), with natural CLOSED/origin state. Iteration imports new helper (`alpha witness:15-16`); unchanged final witness must avoid this import/setup red (finding 6). |
| Honest binding seam | REVISE registered ingress proof | Fixture applies actual production committed commands while simplifying consensus explicitly; native three-replica A1-A5 remains. Current proxy/getter tests exercise application entry rather than registered transport (finding 2). Neither deterministic fixture green nor native focused green certifies full crash recovery/snapshot custody. |
| Clock compression | APPROVE scoped source | Removal witness poll1ms compresses observation, not admission/hold/query/commit budgets. The original baseline first-case runtime includes provisioning; it is not itself a timeout assertion. Injected A3/A4 expiry controls remain distinct. Root's baseline M1 `1000ms` exhaustion remains unresolved operational red (`evidence/baseline-m1.tap`; timeout investigation). |
| Required fields | APPROVE source fixture | Current PREPARE carries full canonical identity, operationsText, validationText/generation/origin and execution envelope through existing builder (`request.js:351-354`); bound decisions/durable state are actual production rows (`apply.js:433-459`; store outcome:276-285). Alpha removal witness actually applies PREPARED and bound decision (`291-338`). |
| Non-vacuity | REVISE known proof gap | Owner-committed nonempty ordinary seed, rejected INSERT absence and zero-operation sealed PREPARE are measured (`alpha witness:250-289`). Current table absent→zero helper (`62-65`) must be replaced with table-existence evidence. PREPARING and post-terminal ordinary observations pending. No fabricated old session/release admission is used. |
| Claim ceiling | APPROVE claim wording | Sealed Quest statement expressly excludes full cutover, snapshots and integrated crash recovery; native A1-A5 proves its actual focused real-replica observable only. Eight parent receipts remain sealed. Current M1 and missing C2 owner integration are not waived for Quest landing. |

## 7. adversarial-js-intrinsics

| Item | Verdict | Evidence and disposition |
| --- | --- | --- |
| Numeric lattice | APPROVE canonical source; limited witness | Epoch uses captured `Number.isSafeInteger` (`bytes.js:26,87-96`): NaN, ±Infinity, unsafe integers and boxes reject; -0 is accepted exactly as the existing safe-integer contract, with no new derived arithmetic. Do not invent a new epoch normalization policy. Iteration witness pins NaN/+Infinity/boxed and intrinsic replacement (`alpha:189-213`); final report should explicitly retain these canonical dispositions. Other numeric owners/budgets are unchanged. |
| Own fields only | APPROVE application source; ingress pending | `copyStrictOwnDataRecord` captures own descriptors/prototype and returns null-prototype records (`src/utils/strict-own-data.js:5-15,61-86`). Inherited/exotic identity cannot become ordinary at application entry (`entry-apply-base.js:416-430`; alpha:126-132). Actual transport boundary remains finding 2. |
| Getter/proxy zero read and TOCTOU | REVISE | Application strict copy rejects proxies before traversal and rejects accessor descriptors without evaluating (`strict-own-data.js:61-86`), as alpha:134-184 pins. Raw registered transport reads occur first (finding 2). Final extraction must use one safe packet with no raw reread. |
| Prototype pollution | APPROVE application source, final real-ingress treatment pending | Captured strict-copy methods and null-prototype records reject inherited fields and ignore hostile enumerable Object/Array/Map/Set properties (`strict-own-data.js:5-15,61-86`). New classification's ambient Array method is independently unsafe (finding 1). Existing Map/Set session ownership and array readers are unchanged; do not add competing validators. Mutation fixtures must restore intrinsics/prototypes. |
| Boxed/exotic/symbol | APPROVE canonical source, ingress pending | Outer arrays/exotic prototypes/proxies/symbol keys rejected by strict record owner; primitive identity strings use typeof+length and epoch uses captured primitive-safe number check (`strict-own-data.js:61-86`; bytes:28-29,87-96). Boxed string/number/boolean cannot meet these primitive checks. Alpha symbol/accessor/proxy and epoch box pair is actual evidence below application entry; registered ingress needs finding 2's negatives. |
| Mutable methods | REVISE | New `.some` is unsafe (finding 1); captured Number validation and captured strict record methods are appropriate (`bytes.js:26`; strict-own-data:5-15). New extraction/classification must not trust ambient array/iterator/string helpers. Existing downstream owner serializers were not redesigned by this deletion. |
| Hash/coercion | APPROVE unchanged owner | Validated primitive identity is type-pinned before `participantIdOf` comparison (`bytes.js:87-96`); current prepared/decision builders and canonical command admission remain existing owners. New routing classifier does not serialize or coerce an unvalidated identity. No new digest algorithm or duplicate validation appears. |
| Authentic arrays | APPROVE unchanged owner / new fixed scan correction pending | Params/operations still use existing bounded own-data array/admission owners; strict outer record deliberately performs shallow copy. `copyDenseOwnDataArray` checks authentic prototype, own safe length and own indexed data descriptors without iterator (`strict-own-data.js:26-52`). New fixed identity-field scan is not an input array; its unsafe `.some` is finding 1 and must be removed/captured. |

## Exact production source manifest

Compared `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f..138be37e6d07706bb71a4ac55aaed77ba0ef06e6`; 28 production paths. A/M/D are added/modified/deleted. Legitimate current SQL/public homonyms are not classified as executable old transaction engines.

```text
M src/diagnostics/raft-churn-sync-sections.js
M src/partition/partition-committed-command-admission.js
A src/partition/partition-local-mutation-admission.js
M src/partition/partition-participant-release-facts.js
M src/partition/partition-participant-transaction-apply.js
M src/partition/partition-participant-transaction-bytes.js
M src/partition/partition-participant-transaction-constants.js
D src/partition/partition-participant-transaction-legacy-fence.js
M src/partition/partition-participant-transaction-request.js
M src/partition/partition-participant-transaction-session.js
M src/partition/partition-participant-transaction-store.js
M src/partition/partition-service-assembly.js
M src/partition/partition-service-constants.js
M src/partition/partition-service-core-base.js
M src/partition/partition-service-durability-fitness.js
M src/partition/partition-service-entry-apply-base.js
A src/partition/partition-service-leader-activation-methods.js
A src/partition/partition-service-participant-transaction-cadence-methods.js
M src/partition/partition-service-raft-init-base.js
A src/partition/partition-service-remote-query-methods.js
A src/partition/partition-service-removal-serving-methods.js
D src/partition/partition-service-transaction-base.js
D src/partition/partition-service-transaction-session-methods.js
M src/partition/partition-service-write-metrics-base.js
M src/partition/partition-snapshot-cadence.js
D src/partition/partition-transaction-handler.js
M src/raft/snapshot-checkpoint-constants.js
M src/raft/snapshot-checkpoint-store.js
```

## Scope and remaining decisions

The child removes the complete executable old session transaction path and necessary consumers: no local BEGIN/PREPARE/COMMIT/ROLLBACK engine, old maps/outcome producer, old committed markers, reconstruction or local expiry repair remains. Required release-work shape, startup old DDL invocation removal, current cadence and mirror-worker extraction are in scope. Broader connection-stamp/reopen/release policy cleanup remains a meaningful follow-on under its current owners; leaving those policies does not preserve an old executor.

Current application snapshot authority/custody, integrated live crash certification, FreshMG, CDC and full eight-receipt TX1 acceptance remain outside this child's proof. Old checkpoint marker-log scan deletion cannot discharge that current obligation. Healthy M1 exhaustion and baseline partial C2/ACK-owner integration remain real independent system issues; neither focused green nor this source review is a workaround. Root may request final component review after source freeze, but actual child defects and required final behavioral evidence must be resolved first. No additional speculative current-owner redesign is requested.
