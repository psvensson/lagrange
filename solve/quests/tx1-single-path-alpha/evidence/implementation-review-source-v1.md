# Independent frozen-source review — TX1 single path

**Provisional source verdict: APPROVE for the exact 31-path manifest below. Whole-candidate / independent Quest approval remains WITHHELD.** No unresolved source defect was found in this frozen source after the category-complete iteration review and incremental inspection. Tests, registry/generated classifications, unchanged-witness source-only A/B and final exact locked-lab evidence are not frozen/accepted by this report. It does not authorize landing, publishing, main merge, full TX1 acceptance or full rs-raft certification.

Reviewed live worktree: `/mnt/data/peter/projects/.worktrees/rs-raft-alpha-single-path-20261013`. Source base `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f`. Exact source content authority: `solve/quests/tx1-single-path-alpha/evidence/source-review-manifest.json`, SHA256 **`f0e68069a7052c18c22dca3ef33152cbae80850bf3d64c6a56baaa068276b490`**. All 31 entries (26 present, 5 deleted) matched before and after inspection; no modified or untracked production path was outside the manifest, and no manifest path lacked a baseline change. No source, test or Git mutation occurred. No new test execution is claimed by this review.

Approved design remains SHA256 `cfcb44237c9a87593dea8aa77a6c442b56e5b5685a50591f0804a12c64800d29`; sealed Quest remains `3a74093d506ec9ec457748976b06e4145b3c7258c588b1e53f2f13894803de53`. Human alpha single-path closeout remains the scope authority. The earlier category-complete rejection remains in `test-output/alpha-single-path-20261013/implementation-review-iteration.md` (SHA256 `a65ad8863e1eabc3111cea37a106b8e76c3d12fe1aa7b7e859c9cc6267b2777e`). This is an incremental disposition of that review, not erasure of its findings.

## Source findings resolved and remaining proof

1. **Mutable identity scan resolved.** `partition-participant-transaction-request.js:124-128` uses indexed primitive iteration over the frozen fixed field list and captured `objectHasOwn`; it does not call ambient Array helpers or the iterator. Classification still delegates identity validity to the canonical bytes owner (`137-154`).
2. **Registered ingress resolved.** `partition-service-entry-apply-base.js:247-261` calls the existing strict extractor before touching classifier fields; rejected input returns INVALID_MESSAGE. One canonical packet is passed to the Raft classifier/step or `handleCanonicalApplicationPayload`, with no raw reread. Application entry uses the same extraction/dispatch (`271-307`). The extraction (`432-446`) admits actual plain direct/one/two-wrapper application/Raft producers: `src/transport/message-router-inbound-dispatch.js:460-470`, `src/message-group/message-group-service-outbound-dispatch-runtime-methods.js:70-80`, `src/raft/raft-rs-peer-delivery.js:98-104`. Nested Raft message validation remains its existing ingress owner; shallow extraction is not new Raft validation.
3. **Removal custody resolved.** `request.js:645-650` permits REFUSED traffic to receive its precise participant refusal, and valid CURRENT query only with existing `findParticipantSession` custody; valid identity without that session retains the removal fence. Entry calls that one owner (`entry-apply-base.js:318-328`). No parallel session predicate or broader request exemption remains.
4. **Historical source residue resolved.** Removed default session alias and old-only SQL transaction constants are absent from shared/constants; README names current request/session/store/apply authority (`src/partition/README.md:29-33`). Dead `src/transaction/transaction-constants.js` is deleted with no source imports. Complete executable old partition transaction sources/markers/maps/outcome producer/reconstruction/heal remain absent. Remaining global matches are legitimate SQL AST/public BEGIN homonyms and current coordinator aliases, not partition executors.
5. **Cadence extraction coherent.** Snapshot tick façade was moved from raft-init to participant cadence (`cadence-methods.js:24-28`), preserving lazy construction and the existing snapshot owner. Its actual timer order remains hold → fitness → snapshot with injected nowMs (`45-50`); final assembly installs it once (`assembly.js:45-49`). No changed budget, snapshot predicate or lifecycle policy appears.

Outstanding whole-candidate gates: freeze/test hashes and complete changed-test review; retain/refit current fitness strike/legal-window/recovery/SOLO/consequence controls rather than remove their old-fixture suite wholesale; finish impact contract/live endpoint/exact primary witness registration and generated classifiers; source-only revert using the unchanged final reachable witness must produce named assertion reds instead of absent-import/setup/timeout reds; final candidate locked-lab regression cone and appropriate checks must bind the exact immutable candidate. Root's reported current alpha 7/7 is useful interim evidence but not final content-bound acceptance. Existing M1 healthy provisioning exhaustion and inherited C2/ACK-owner integration remain independent red system issues and cannot be counted as child green or waived for landing.

## Category-complete disposition

Every sealed item is accounted for below. APPROVE is a source verdict. PENDING concerns required whole-candidate evidence; it is not source acceptance of unmeasured behavior. Evidence paths are frozen-source coordinates unless a test is explicitly marked provisional. Unchanged reviewed owner code is carried from the exact immutable iteration only after its hash/content was compared against the frozen manifest.

### 1. admission-gating

| Item | Source verdict | Evidence / proof limit |
| --- | --- | --- |
| Same-state precheck/enforcement | APPROVE | `request.js:137-154,629-633,645-650,662-671` uses one classifier, canonical bytes identity and current session/store. Removal criterion now matches exact custody. |
| Transient/hard consumers | APPROVE | Existing request `refusalOf` / `keepsSealedSession` (`request.js:157-185,331-346`), local mutation pause defer (`local-mutation-admission.js:26-31`), epoch/leader routing typed answers (`remote-query-methods.js:40-60,251-265`) retained. Removal still returns typed retryable fence (`entry-apply-base.js:288-295`). |
| Existing budgets | APPROVE | Core:179-188,234-236 retains hold/sweep/pending defaults; removal poll/default moved unchanged (`removal-serving-methods.js:15-20`); no enlarged wait/timeout. M1 is separately red. |
| Reason/envelope shape | APPROVE | TRANSACTION current router only, identity refusal through existing `answerOf`/`refusalOf`; strict ingress INVALID_MESSAGE before dispatch (`entry-apply-base.js:247-285`), current QUERY acknowledged refusal (`request.js:629-633`). Existing typed query answer copier remains (`remote-query-methods.js:85-100`). |
| Hold release/event/budget | APPROVE; phase proof PENDING | Owned PREPARE completion deletes exact session (`request.js:331-346`; session:136-140); terminal committed row plus afterCommit reservation readmission (`apply.js:381-384,433-458`); ENTRY_COMMITTED remains after commit (`630-635`). Provisional alpha:348-465 now measures PREPARING/PREPARED/terminal and drain, final hash/lab pending. |
| Gate freshness | APPROVE | Current volatile map plus store PREPARED query (`session.js:89-108,127-128`); no admission cache; release facts reads current work (`release-facts.js:46-59,89-110`). |
| Honest blocked identity | APPROVE | Safe own-data request fields plus exact participant identity owner (`request.js:157-165`; bytes:87-96); no raw registered ingress reads survive. |

### 2. recovery-replay

| Item | Source verdict | Evidence / proof limit |
| --- | --- | --- |
| No stale clobber / recovered writes | APPROVE | Five deleted old source files plus obsolete constants; current store origin/generation CAS and PREPARED decided CAS retained (`store.js:118-131,243-258`), committed statement/txop outcomes and CDC application remain atomic (`entry-apply-base.js:618-670`; apply:400-441). Mirror recovery retained (`leader-activation-methods.js:109`). |
| Restart/live distinction | APPROVE bounded | Current durable reservation remains store authority (`store.js:140-153`), volatile leader sessions discard on demotion (`session.js:148-155`); mirror worker durable/live exclusion remains existing split-mirror resumer. Removing old reconstruction claims no current crash certification. |
| Lost enlistment not success | APPROVE unchanged | Coordinator production unchanged by manifest; absence is UNKNOWN (`store.js:263-279`), no empty-participant fallback added. Inherited C2 gap remains independently open. |
| Replay / rollback idempotence | APPROVE | Settled committed SQL before reservation/run (`entry-apply-base.js:626-637`); txop application transaction + durable outcomes (`apply.js:400-409`); bound rollback/decision replay retained (`445-467`); unknown retired command fails typed closed (`entry-apply-base.js:587-599`). |
| Unreadable/absent never terminal | APPROVE | Store outcome UNKNOWN (`271-279`); canonical work rejects unavailable facts instead of removed legacy zero defaults (`release-facts.js:46-65,113-114`). Snapshot scan removal creates no new authority; current scrub excludes app tables (`snapshot-checkpoint-store.js:302-312`). Current snapshot custody remains uncertified. |

### 3. sweep-timer

| Item | Source verdict | Evidence / proof limit |
| --- | --- | --- |
| nowMs / unref lifecycle | APPROVE | Cadence injected interval/now/clearInterval, start-once/shutdown guard/unref (`cadence-methods.js:36-57`); explicit method nowMs (`31-33`); lifecycle start/stop retained. |
| Authority / role / SOLO | APPROVE; fitness proof PENDING | Current session expiry no SQL, prepared reports no decision (`session.js:158-199`); fitness SOLO composition moved from deleted mixin unchanged (`durability-fitness.js:96-99,162-174`). Refitted current fitness controls must survive. |
| Crash-equivalent JS cleanup | APPROVE | Demotion/expiry affects only current volatile sessions; inFlight excluded (`session.js:148-174`), durable prepared row never timed out to terminal. No old local heal partial path remains. |
| Legal windows / detectors | APPROVE | HoldTimeoutMs unchanged (`core:179-188`; session:215); PREPARED reports once (`179-199`), no terminal action. Injected native A3/A4 separate from real M1 exhaustion. |
| Sweep starvation / circular wait | APPROVE | Exactly one tick preserves hold/fitness/snapshot order (`cadence:45-50`), lazy snapshot single-flight owner (`24-28`); bound decision directly releases reservation (`apply:383-384`), no polling correctness repair. |

### 4. concurrency-serialization

| Item | Source verdict | Evidence / proof limit |
| --- | --- | --- |
| Sync gate / durable backstop | APPROVE | BEGIN gate no-await (`request.js:301-318`), canonical activity (`session:127-128`), routing collision covers volatile ACTIVE/PREPARING and durable PREPARED (`89-108`). |
| Check/await/use | APPROVE | Query classifier/gates/enforcer synchronous before ordinary await (`remote-query-methods:251-278`); PREPARE seal before await and apply generation/decision revalidation (`request:336-361`; apply:416-450); removal drain rereads canonical work (`removal-serving:15-20`); activation callback rechecks leadership (`leader-activation:95-98`). |
| Single winner | APPROVE | Existing inFlight/sealed preparation, immutable decision/apply/CAS and settled outcome owners remain (`store:243-258`; entry:626-633`); no new retry/claim/driver. |
| Timer reentrancy | APPROVE | Sweep skips inFlight (`session:165`), lifecycle single timer (`cadence:36-57`), prepared terminal decision application-owned; moved snapshot façade does not add a second timer. |
| Actual collision/lock identity | APPROVE | Service-scoped participant map plus transaction match (`session:77-79`), exact routing-session match and current durable query (`89-108`), partition reservation (`store:140-153`). Provisional alpha:348-405 has unrelated nonempty seed and terminal reuse; final evidence pending. |

### 5. owner-interaction

| Item | Source verdict | Evidence / proof limit |
| --- | --- | --- |
| Sole decision owners | APPROVE | Bytes identity; session/store current custody; request classification/removal; remote-query epoch/routing; release-facts work; current committed apply/kernel/CDC. Assembly installs façade methods once (`assembly:38-56`). Deleted executable old owners have no source imports. |
| Typed seams/authority | APPROVE | Canonical intent admission remains request/bytes; durable apply authoritative (`apply:416-459`); release facts consume membership/generation/work (`release-facts:85-115`); local mutation origin/pause refusal (`local-mutation:26-31`); no diagnostic permit. |
| Paired invariant / A-B | APPROVE source; PENDING proof | Classifier keeps ordinary routing and canonical malformed/current paths (`request:137-154`); valid write gate order preserved (`remote-query:251-265`). Provisional final witness fixes nonempty/phase controls, but unchanged-witness source-revert proof is not yet supplied. |
| Stale then fresh | APPROVE | Collision rereads owners; PREPARE session cleanup and committed terminal release clear veto (`request:344-345`; apply:433-458); moved epoch logic unchanged (`remote-query:164-265`). |
| Pressure / backoff | APPROVE unchanged | Current queue/kernel retries and pending budgets retained; `keepsSealedSession` retains retryable/RESERVED waits (`request:331-346`), no force/timeout enlargement. |
| Owned wake/release | APPROVE | `readmitReservedWrites` scheduled after committed transition (`apply:381-384`); exact session cleanup (`session:136-140`); removal only observes canonical owners. |
| Projection not authority | APPROVE | Diagnostic/comment changes remain attribution; facts read live producers and return UNAVAILABLE (`release-facts:89-114`); no old marker/counter projection authorizes. |
| Source fingerprints / treatment | APPROVE source binding; PENDING proof | Exact31-path manifest verified twice, baseline and iteration anchors recorded above; final test/revert/lab content bindings withheld. Expected red and M1 are never green. |
| No fallback/duplicate/raw read | APPROVE | Current activity composition once (`session:127-128`); primitive request scan and one strict registered extraction (`request:124-128`; entry:247-261,432-446`); exact removal owner predicate; no local log inference/alternate executor. |
| Registry / endpoints / exact witness | PENDING | Tests and impact/generated registry still moving. Source correctness cannot discharge these contract edges; freeze and review all final endpoint/classification bytes before approval. |

### 6. harness-fidelity

| Item | Verdict | Evidence / proof limit |
| --- | --- | --- |
| Named behavioral unchanged-test revert | PENDING | Original four red assertions remain valid baseline evidence; provisional alpha removed new helper import, but final unchanged test must be measured after source-only revert. Import/method/setup/timeout-before-owner failure is insufficient. |
| True seam / consensus scope | APPROVE source; PENDING final proof | Registered extraction is source-correct; provisional alpha uses production registration, strict getter/proxy negatives and direct/wrapped app/Raft positives (`alpha:73-94,137-279`). Fixture consensus remains simplified; native A1-A5 preserved. No live crash/snapshot certification is inferred. |
| Clock compression / exhaustion | APPROVE scoped | Poll1ms is observational compression, unchanged caller/hold/commit budget. Native injected A3/A4 remain distinct. Healthy M1 provisioning1000ms bound exhaustion is still red. |
| Identity/envelope/work completeness | APPROVE source | Current command builder/identity and generation/origin fields preserved (`request:357-360`), current durable state/cursor/outcome evidence (`store:276-285`; apply:433-459); release canonical work (`release-facts:54-65`). |
| Non-vacuity | PENDING final proof | Provisional alpha now records current table exists, retired absence, owner-committed nonempty seed, rejection leaves no row/operation, PREPARING/PREPARED/terminal and removal held-versus-absent identity (`alpha:62-72,99-135,348-465`). Need frozen unchanged witness and exact measurement. Current fitness controls must be refitted. |
| Honest claim ceiling | APPROVE | Quest explicitly excludes full cutover/snapshot/integrated crash; eight parent receipts unchanged. Source approval here is not final land or broad certification. |

### 7. adversarial-js-intrinsics

| Item | Source verdict | Evidence / proof limit |
| --- | --- | --- |
| Numeric lattice | APPROVE canonical | Captured safe-integer owner (`bytes:26,87-96`) rejects NaN/±Infinity/unsafe/boxes; -0 retains existing safe-integer acceptance, no new arithmetic/normalization. Other numeric contracts unchanged. |
| Own-property discipline | APPROVE | Captured strict utility uses own data descriptors/null-prototype copy (`src/utils/strict-own-data.js:5-15,61-86`); registered ingress now consumes it before reading classifier fields (`entry:247-255`). |
| Accessor/proxy/TOCTOU | APPROVE source; PENDING final witness | Proxy rejected before traversal, accessor descriptor rejected without evaluation (`strict-own-data:61-86`); single extraction/canonical dispatch has no raw reread (`entry:247-273`). |
| Prototype pollution | APPROVE source | Strict-copy null-prototype record and captured descriptor/hasOwn methods ignore inherited enumerable Object/Array/Map/Set fields; fixed list is frozen and indexed. Existing current Map/Set owners are unchanged; mutation fixtures restore methods. Final actual-ingress treatment still content-bound pending. |
| Boxes/symbol/exotics | APPROVE | Strict outer record rejects arrays/exotic prototypes/proxies/symbol keys (`strict-own-data:61-86`); string/epoch primitives pinned in canonical identity (`bytes:28-29,87-96`). No duck-typing or coercion added. |
| Mutable intrinsics | APPROVE source | New scan no ambient Array helper/iterator (`request:124-128`), captured hasOwn/safe-integer and strict utility intrinsics; no new coercive string/serialization path. Provisional alpha mutates `.some`/Number and restores (`alpha:281-313`), final A/B pending. |
| Digest/coercion | APPROVE unchanged | Primitive type pin before participant identity formation/comparison (`bytes:87-96`); existing canonical prepared/decision/admission serializers retained. New classifier does not hash/coerce hostile data. |
| Array authenticity | APPROVE unchanged | Existing dense own-data array reader authenticates prototype/own safe length/indexed descriptors without iterator (`strict-own-data:26-52`); params/operations admission unchanged. Fixed identity list is trusted frozen owner data with primitive indexed reads. |

## All 31 production paths accounted for

Exact status/hash for every path is in the manifest. Inspection covers the original28-path source review plus all eight filesystem deltas from immutable `138be37e6d07706bb71a4ac55aaed77ba0ef06e6`. Filesystem comparison was used for untracked additions; a Git-only diff against the iteration would incorrectly display those added modules as deleted.

- Unchanged reviewed bytes: diagnostics attribution; committed-command admission; local-mutation admission; release facts; participant apply/bytes/constants/session/store; assembly; core; durability fitness; leader activation; remote query; removal serving; write metrics; snapshot cadence; checkpoint constants/store; four deleted old executor/fence/session files.
- Modified delta bytes: README; participant request classifier/removal predicate; service constants; entry ingress/canonical dispatch; cadence snapshot façade; raft-init façade removal; shared default alias removal.
- Additional deleted dead owner: `src/transaction/transaction-constants.js`, no source consumers.

The manifest's literal path set is:

```text
src/diagnostics/raft-churn-sync-sections.js
src/partition/README.md
src/partition/partition-committed-command-admission.js
src/partition/partition-local-mutation-admission.js
src/partition/partition-participant-release-facts.js
src/partition/partition-participant-transaction-apply.js
src/partition/partition-participant-transaction-bytes.js
src/partition/partition-participant-transaction-constants.js
src/partition/partition-participant-transaction-legacy-fence.js (deleted)
src/partition/partition-participant-transaction-request.js
src/partition/partition-participant-transaction-session.js
src/partition/partition-participant-transaction-store.js
src/partition/partition-service-assembly.js
src/partition/partition-service-constants.js
src/partition/partition-service-core-base.js
src/partition/partition-service-durability-fitness.js
src/partition/partition-service-entry-apply-base.js
src/partition/partition-service-leader-activation-methods.js
src/partition/partition-service-participant-transaction-cadence-methods.js
src/partition/partition-service-raft-init-base.js
src/partition/partition-service-remote-query-methods.js
src/partition/partition-service-removal-serving-methods.js
src/partition/partition-service-shared.js
src/partition/partition-service-transaction-base.js (deleted)
src/partition/partition-service-transaction-session-methods.js (deleted)
src/partition/partition-service-write-metrics-base.js
src/partition/partition-snapshot-cadence.js
src/partition/partition-transaction-handler.js (deleted)
src/raft/snapshot-checkpoint-constants.js
src/raft/snapshot-checkpoint-store.js
src/transaction/transaction-constants.js (deleted)
```

Current connection/reopen/release policy follow-on, current application-snapshot authority, integrated crash/FreshMG/CDC/full TX1 acceptance remain independent owners/claims. No source waiver, duplicated owner or hidden old executor is justified by those open obligations. No final evidence or registry approval is conferred by the provisional source verdict.

## Root audit update after v1 inspection

Root's source-guideline audit identified four new constructor-literal violations in the new method-factory conversion loops and two new decision-boundary violations in classifier structure; audit artifacts are `test-output/alpha-single-path-20261013/source-frozen-literals.json` and `source-frozen-decision-boundaries.json`. Root authorized a scoped source-freeze reopening for correction without semantic or ratchet changes. Therefore this v1 report records semantic source review only; the actual new source-audit defects must be corrected before whole-candidate acceptance. The `f0e680...` manifest is historical immutable evidence. A new v2 manifest and its actual source delta require inspection; the provisional semantic verdict cannot be copied onto those new bytes. Five other decision errors are being compared against e6 and are not presumed inherited or waived by this report.

Writer also reports a restored/refitted current fitness suite with owner signal fixture and actual-service cadence/assembly smoke, 6/6 top-level tests. This is reported interim evidence; final source/test/registry freeze and exact proof remain pending.
