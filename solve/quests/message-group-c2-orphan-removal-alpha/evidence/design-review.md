# Independent C2 orphan-removal design review

**APPROVE the bounded subtraction design. Implementation approval, Quest closure and full FreshMG/cutover acceptance are NOT granted.** No semantic design blocker remains after the explicit external-island wording and live-classifier inventory corrections. The current behavioral baseline has real reds which remain HOLD obligations; removing dead source cannot relabel those as green.

Read-only review of actual source, composition, contracts, witnesses and retained evidence. No source/test/metadata/Git edit, test execution, Quest disposition, commit or external action was performed. Only this report was written. The implementing owner must obtain a separate content-bound implementation verdict before relying on approval.

## Exact binding and integration baseline

Sealed base is `e6d43bc1acb128a2b83ac89c77a3ec400e7edb1f`; sealed Quest SHA256 **`cf456f1ccc6a96b021e1c3bab8e9c9f0a98ae2c8ab5678e3ed43b27bfb3119f8`**. Reviewed design SHA256 **`d485fe9810816d63bfaeb787b417c532b97a39610b6dd2f3891db4e9418e0d3f`**. Corrected additive source census SHA256 **`ce01c9eb32d2c57004de34f84c6444b7a3232f6508766ac723f9107516898deb`**. Initial failed receipt SHA256 **`312138cd65f6d00bd0a2007702a4bc8659e16271a26f3b0c6867211e80dce952`**; no candidate receipt is approved.

Current first-attempt baseline is reviewed TX1 preservation checkpoint **`d35d8828c630d1b9675b47f511c477b3cc9ee991`**. Independent Git-object comparison confirms all four proposed C2 production paths, both named architecture contracts, all eleven proposed behavioral witness files, the repository membership facade, discovery owner and native progress/transition owners are byte-identical between e6 and d35. The source worktree is at d35 with only the sealed C2 Quest directory untracked and no source/test change. Shared repository/query retry dependencies do change through the reviewed TX1 correction; the full transitive graph is not called identical. New exact candidate proof must compare against d35 on the same hosts and preserve original e6 seal/history.

Structural baseline logs were read: seal-time focused log SHA256 `1ccf5702b1e9f8d183bcf89509d5b7680d95200016058269544f7736106aba93`; current d35 focused log **`12216b2937737c761f82f19a78839d32439d0c822791bc706eb8a285e598d388`**. Both report exactly one unresolved import,15 modules/36 edges: promotion→absent `learner-catch-up-acknowledgement.js`. This is a qualified structural defect, not a named behavioral assertion red. A final zero-error focused cruise is necessary but cannot by itself satisfy the five receipts.

## Exact subtraction and preserved ownership

Delete the complete457-line promotion module and227-line learner-successor module. The promotion module imports successor at:69; neither has an external production/test/script caller, repository installation, package/export registration or impact-contract owner/witness edge. Independent path/export/helper/value searches across current source, tests, scripts, workflows, package entry and registry agree with the corrected census. The promotion module additionally imports an absent acknowledgement export at:54 and missing module at:55-56. Restoring a historical file would leave the other absent surface and would not establish a current owner or caller.

Authorization owner subtraction is exactly `observeLearnerActionAbsence` (:478-493), `RECORDED_LEARNER_FACT_COLUMNS`, `recordedLearnerCreateBasis` and `recordedLearnerOrigin` (:654-695), plus pair-only comment/export residue. Their only outside consumers are in the island. The eight named recorder helpers lose exports only; their implementations remain because the initial recorder and generic branch call them internally. Preserve `recordedLearnerFactIsValid` (:642-652), branch selection (:182-216), initial authorization (:294-316), recording/recovery (:597-627), the full current absence/refusal classifier (:373-443), and NONCOMMITTED. The unused absence wrapper is not the underlying live decision owner.

Permit subtraction is exactly `inKeyOrder`/`encodeMembershipPermit` (:122-131), `MEMBERSHIP_ACTION_PHASES`/`membershipActionPhases` (:157-179), and pair-only result members NOT_CAUGHT_UP/ORIGIN_UNRECORDED/SUCCESSOR_ISSUED (:22-40). Preserve canonical persisted key lists/decoder fields, action matcher, identity/claim codecs, generic PROMOTE/ABORT branch specifications, PROMOTION_IN_FLIGHT/VOTER_COMMITTED/TARGET_REMOVAL_IN_FLIGHT phases and all current failure states. NONCOMMITTED is still produced by the live recorder classification. The retained encoder of a committed learner permit is `committedLearnerPermit` in authorization:355-357; it does not call the deleted permit encoder. Existing origin encoding/decoding imports and ROLE_LEADER remain used by current learner evidence and absence classification; remove only proven exclusive bindings, never a whole import by association.

No new module, validator, adapter, retry, execution driver, cache, table, effect or decision algorithm is approved. The generic row CAS remains with ReplicaOperationRepository; OperationWorkflowOwner remains initial learner discovery/reentry owner; the existing native membership transition owns atomic current promotion proof/proposal; PartitionService remains the partition promotion/wake owner. No current native producer, release wake or durable branch is lost with this unbound island.

The current contracts explicitly limit discovery to initial sequence1 ADD_LEARNER and report later-phase debt without actuation (`message-group-registered-learner-read.md:96-109,127-136`). Outcome-recording preserves open J1/promotion/physical obligations (`message-group-learner-outcome-recording.md:95-110`). Generic branch intent is not a dispatch grant. The open FreshMG Quest's eight receipts, constraints and required two serial replacements/off-seed seed-loss proof remain unchanged.

## Complete category review

Coordinates below are current d35, identical for the listed core C2 owners at e6. Abbreviations: **Auth**=`src/rebalancer/replica-operation-message-group-membership-authorization.js`; **Permit**=`...-membership-permit.js`; **Claim**=`...-membership-owner-claim.js`; **Discovery**=`src/rebalancer/operation-workflow-message-group-membership-recovery.js`; **Native**=`src/raft/raft-rs-membership-transition-runtime.js`. APPROVE here means preserve the existing design/owner, never a new measured pass or unlimited correctness claim.

### Admission-gating — 7 items

1. **APPROVE:** preserve same current permit/row/holder state for precheck/enforcement: Auth:245-314; Claim:45-82; current native leader/configuration/progress checks Native:200-242. Deletion adds no admission precheck.
2. **APPROVE:** current UNKNOWN/UNAVAILABLE/CONFLICT/STALE_OWNER/NONCOMMITTED classification remains Auth:405-443; Discovery:152-169. Runtime witness:974-999 pairs no-effect refusals with later genuine recording. Delete only the three pair-only outcomes.
3. **APPROVE:** existing30s holder TTL (`replica-operation-owner-lease.js:41`),250ms mutation delay/15s local+query budget (`replica-operation-repository.js:229-234`), owner dispatch timeout (`operation-workflow-message-group-native-read.js:25-40`) and router-owned proof timeout (`partition-service-learner-promotion-proof-methods.js:271-287`) stay unchanged. No new wait, retry count or increased bound.
4. **APPROVE:** preserve canonical `{outcome, operation}`/claim/debt shapes Auth:31, Claim:23-24, Discovery:62, Permit:28-45, and actual native reason grammar. Removing absent producers must leave no consumer of a retired member.
5. **APPROVE with limit:** native promotion observable is committed voter membership; existing Native:269-295 proposes under its owner turn, and partition proof/wake controls observe promotion. Initial recording does not release membership debt/lane (`registered-learner-read:127-136`). No removed island method is a live release producer. Full FreshMG source removal/lane release remains open, not proved here.
6. **APPROVE:** every decision still uses actual authoritative row and fresh boot/claim evidence after awaits (Auth:153-179,553-568), and native current term/configuration/progress in one turn. No memo or permanent veto added.
7. **APPROVE:** actual operation/group identity remains in typed diagnostic events Discovery:213-222; origin/holder/receiver bindings remain actual owner fields. Pair comments must not falsely claim live successor/promotion issuance.

### Recovery-replay — 5 items

1. **APPROVE:** preserve exact full-row basis and only three receipt writes (Auth:507-532), fresh row after native/boot observation (:563-568), and permanent native registry/current lifecycle owners. Dead recorded-CREATE basis removal cannot authorize an alternate current write.
2. **APPROVE:** current by-operation-ID reconstruction Auth:614-625 and initial sequence/phase discriminator Discovery:98-119 stay unchanged. False-positive later-phase recovery is refused before claim/native work (:182-191).
3. **APPROVE:** unavailable authority remains distinct from legitimate empty census (`repository-message-group-membership-methods.js:35-48`). No missing participant/target/origin is substituted with an empty grant; Discovery:193-200 gives NO_HOSTED_WITNESS and preserves debt.
4. **APPROVE:** exact recording replay, lost answer/readback and generic branch CAS remain Auth:100-179,494-541; branch witness has reopen/competitor/terminal/lost-answer controls (:789-859,970-1106). Native origin rollback test retains actual failed-apply no-partial-effect assertions in runtime-authorization witness:677-721. No rollback or replay algorithm is changed by de-export.
5. **APPROVE:** absent NOT_RECORDED without a proper fencing observation remains UNKNOWN, unavailable stays unavailable, malformed is conflict (Auth:409-443; runtime witness:974-999). Preserve the live absence classifier/NONCOMMITTED and never treat absence as successor entitlement or terminal success.

### Concurrency-serialization — 5 items

1. **APPROVE:** current local live-claim predicate Claim:64-70 and durable full-row CAS Claim:123-159 remain. No deleted map or missing method is substituted as the backstop.
2. **APPROVE:** preserve revalidation after each await and immediately before submission (Auth:153-179,507-568); native synchronous delivery check immediately before proposal Native:269-279 remains. No stale row carried into a new write.
3. **APPROVE:** restart, sweep and replicated-row wakes still converge through one operation lane/claim (Discovery:202-211; native-read:71-90). Deleting an unregistered successor adds no competing winner.
4. **APPROVE:** no timer/retry registration changes. Current partition wake coalescing and single timer stay `partition-service-learner-promotion-wake-methods.js:129-164`; wake witness:111-164 proves in-flight coalescing. No dead source callback remains scheduled because neither island is installed.
5. **APPROVE:** identity/lane keys remain exact operation+group+transition+source/target identity (Claim:35-51,64-70; Permit:181-187; Discovery:206-209). Unrelated operation lanes remain separate; no raw address is promoted into membership identity.

### Owner-interaction — 10 items

1. **APPROVE:** sole semantic owners are repository authorization/recording/branch, workflow initial discovery/reentry, native configuration/progress/proposal and partition promotion/wake. Explicit facade imports/installations in `repository-message-group-membership-methods.js:7-14,65-90` bind no orphan method.
2. **APPROVE:** preserve encoded permit/identity/claim contracts, native typed outcomes and initial recording grammar; no alternate verdict or missing-helper replacement is introduced. Generic branch intent remains an existing row CAS rather than dispatch authority.
3. **APPROVE proof plan:** same current witnesses pair successful recording/promotion with refused no-effects and exact changed columns. Runtime:974-999 pairs refusal→fresh success; recipient:19-46 pairs real record/replay/uncommitted UNKNOWN; branch tests pair durable intent with unchanged non-owned columns and failed competitors. Candidate measurement is still required.
4. **APPROVE:** stale/no-witness/transport answers are reevaluated by current triggers; runtime:997-999 later succeeds, discovery:266 onward wakes a newly hosted witness. No cache invalidation/refresh algorithm change is approved.
5. **APPROVE:** existing mutation retry/backpressure/identity and workflow single-flight remain with the current d35 owners; Auth:158-169,515-521; native-read:75-80. Removed island jitter/pressure policy is not redirected elsewhere.
6. **APPROVE with limit:** retained services-row/epoch wakes and proof completion do not reference the island; partition wake:129-164 and witness:111,137,287 remain. Initial learner recording does not release debt; full source-removal/cleanup release is excluded and open.
7. **APPROVE:** periodic cache is only a hint; each candidate is authoritatively re-read (Discovery:58-61,173-200). Native evidence and exact row CAS remain authority; diagnostics/census cannot authorize a branch or physical CREATE.
8. **APPROVE proof plan, NOT measured:** final candidate/predecessor must carry exact source manifests and unchanged reachable behavioral witnesses on the same locked hosts. The dependency edge is a structural falsifier only; absent files alone and test import/setup failures never count as behavioral preservation.
9. **APPROVE:** independent direct path/export/helper/value/registration searches find no external island caller or equivalent fallback. Actual remaining reads stay owner-owned; shared live classifiers/functions must remain single implementations. Final implementation must repeat the closure audit for all removed keys/export aliases, not just module names.
10. **APPROVE:** current registry contract/endpoint/witness lists retain initial learner observation/recording/read, not the orphan paths (`impact-contracts.json:886-979,1823-1968`). Generic branch/later-phase witnesses remain. Remove only proven stale generated/allowance residue through canonical producers; no old path allowance for this pair was found in the current guideline baselines. FreshMG acceptance text and receipt set are untouched.

### Harness-fidelity — 6 items

1. **APPROVE with explicit qualification:** dependency red is unresolved import, not intended behavioral red. Companion receipts must engage actual current owners and named assertions; source-only restore negative may reproduce the structural edge but is not native behavioral certification. Existing baseline behavioral reds must remain red/classified until legitimately repaired.
2. **APPROVE current seams:** native/operation fixture is file-backed but operation SQL is not distributed SQL (runtime-authorization header:1-5); recipient uses actual two MessageRouters+registered handler (recipient:19-46); branch uses actual repository/file-backed row CAS, not a duplicate semantic executor. Process-loss sends actual SIGKILL after named cuts (`process-loss:37-81`), with no graceful cleanup repair.
3. **APPROVE:** unchanged fixture clock/order/budgets, including8s worker boundary and25s process-loss/30s recipient/discovery envelopes (`process-loss:16,119-120`; recipient:19; discovery:88). A healthy fully spent bound is a system red; no retries into proof or timeout enlargement.
4. **APPROVE existing field completeness obligation:** encoded identities/permits/source claims and actual holder/native stamps must be complete; source/cache fixture:35-52 and native promotion command fixture:19-38 enumerate their fields. No absent field equality or synthetic generation0 grants. Final positive controls must remain nonvacuous and exact.
5. **APPROVE claim ceiling:** actual native multi-member promotion and refused proposal counts accompany pure decision tests; later-phase discovery witness:252-264 proves no row/native effect. One-runtime claim/cache integration explicitly isolates SQL/Raft/CDC boundary and cannot certify physical replacement (`claim-cache` header:1-8). Baseline branch positives currently failing cannot be asserted vacuously or deleted to force green.
6. **APPROVE scope distinction:** native in-process consensus behavior, repository boundary fixtures, actual OS process loss and actual registered transport each prove their named seam. None closes physical distributed replacement, power-loss or off-seed seed-loss/FreshMG acceptance. Existing eleven named suites are a preservation cone, not a full corpus/main claim.

### Adversarial JavaScript intrinsics — 8 items

These items approve preservation, not a new proof that all unchanged ambient APIs are hardened. Only dead functions/maps/exports are subtracted; no new guard or parser is permitted.

1. **APPROVE preservation:** Permit integer helper:73-75 rejects unsafe/noninteger/-0 values; claim derived generation/expiry overflow guards remain Claim:98-117, branch witness:424-434. Native current progress remains validated by its existing canonical owner. No new arithmetic algorithm.
2. **APPROVE preservation:** encoded-record decoders use JSON parse and exact own keys (Permit:76-91); retained strict action input Auth:323-334 uses canonical strict-own utility. No inherited identity becomes a new grant.
3. **APPROVE preservation with limit:** action input/absence copying remains Auth:323-334,384-393, utility `strict-own-data.js:64-100` rejects proxy/accessor/nondata shape before reads. Existing runtime hostile action controls:608-640 remain. Other untouched branch/claim entry destructuring is not newly certified as zero-getter execution; no broad guard redesign belongs to this subtraction.
4. **APPROVE preservation with limit:** exact own parsed fields and captured strict-copy intrinsics remain; no new prototype helper or pollution path is added. General decoder ambient Array/Object helper assumptions remain unchanged and are not claimed fully pollution-proof by this review.
5. **APPROVE preservation:** encoded inputs must be primitive strings before parsing (Permit:72,83-90); boxed/nonstring/exotic values cannot become accepted encoded records through coercion. Strict copied action inputs retain existing symbol/exotic rejection; runtime:634-640 preserves inherited/symbol/nonenumerable controls.
6. **APPROVE preservation with limit:** captured intrinsics in `strict-own-data.js:3-14` stay untouched. Permit still uses existing ambient keys/every/JSON functions; removing its unused encoder/action-stage map does not add a mutable-intrinsic classifier. No new tests are required solely to redesign unchanged owners, and no expanded hostile-host guarantee is granted.
7. **APPROVE preservation:** type pinning/byte bound before JSON parse remains Permit:72-90; retained origin codec and recorded-fact canonical byte checks Auth:366-371,642-650 remain. Deleting the unused encoder must not replace canonical recorded learner serialization or digest/identity owners.
8. **N/A new array ingress:** four-path subtraction introduces/changes no array input reader. Existing stamp/membership array validation remains with the native committed-stamp owner; no iterator-based substitute or handbuilt progress array is added. Final unchanged native/stamp controls remain required evidence.

## Existing reds and closure obligations

Read current locked tv-dator baseline input/status/NDJSON at d35: wake41,partition promotion47 and pure progress76 runner assertions pass; branch authorization90 assertions and DT6 progress30 assertions fail, all attempt1/no retries. First branch failure is the intended positive “promotion authorization commits exact target intent; replay/reopen never writes it twice”; DT6 fails actual retirement evidence “transport cannot prove handler identity, so retirement was refused”. Parent reports21 branch assertion failures. These precede any C2 source edit and are not deletion regressions or green preservation. No root cause is asserted from aggregate output. All required behavioral receipts remain unapproved until exact candidate and same-host controls establish honest outcomes and the owner resolves required reds; unchanged-baseline attribution alone does not waive a safety or healthy-progress obligation.

The approved implementation must delete only the listed island/exclusive residue, leave current function bodies/encodings/effects untouched, run final no-reference/unused-export and exact static/metadata checks without ratchet increases, and receive independent source verification at a frozen manifest. Any hidden consumer, current helper removal, changed current semantic predicate or necessary proof weakening is REVISE at implementation review. Parent/TX1/C2 inherited runtime/static/full-corpus/FreshMG obligations remain explicit; this design verdict cannot close them.

## Relevant source and witness fingerprints

All entries below were independently read from both e6 and d35 and match.

| Path | SHA256 |
| --- | --- |
| `src/rebalancer/replica-operation-message-group-promotion.js` | `589ff7f6059a20252c6a886aeac018e0c04942573ddc39550ecebb78bb6e4382` |
| `src/rebalancer/replica-operation-message-group-learner-successor.js` | `0ebebdeafc727b79742c55d05cdec0033da6fcb000b8e65a4a08ad1c2335cda0` |
| `src/rebalancer/replica-operation-message-group-membership-authorization.js` | `f538d0317409642e4265a53d46fb82c42c6c7465daa8fb7a15833b948c07fa10` |
| `src/rebalancer/replica-operation-message-group-membership-permit.js` | `20822a12027a4e375402324ea676496e028b133925e40ef37cf2904b92f918c1` |
| `architecture/contracts/message-group-registered-learner-read.md` | `00b407d8d476f81b74ab5cb3b6e1906eac2a181e0b76a2f4a451d105c5b08233` |
| `architecture/contracts/message-group-learner-outcome-recording.md` | `9ceb3e1f961c5d74c984a258e73b1c8f8a86606a007cc03cc91fc72300445d86` |
| `test/integration/message-group-learner-runtime-authorization.integration.test.js` | `b212ad9139fa03cd3ad698d2a1e853eb9e5e2cfb46a2548c16c18cb530e54444` |
| `test/integration/message-group-membership-claim-cache.integration.test.js` | `cacf237059ee99f449ca938691e0df80b8b587e9594acb4dca5a84506c32b70a` |
| `test/integration/message-group-learner-process-loss.integration.test.js` | `dfa192086726fcbe98b12c98647a7947d1efc93e0e0044dab7dc31cd3ce1f932` |
| `test/integration/message-group-learner-recipient.integration.test.js` | `c262b50af2794be62112166ba391919edc2d2ae01dd518413fe7ee770777d965` |
| `test/integration/message-group-learner-discovery.integration.test.js` | `253624220e1e9a91e2735c4c2c8b8eaf55e785c20e1c1742a02738ace8eb345e` |
| `test/rebalancer/message-group-membership-branch-authorization.test.js` | `2e4dd8fd53ffd0da0a9f100c6ed8f795c5f862f5665989adc460dcf7812810f5` |
| `test/message-group/message-group-fresh-learner-promotion.test.js` | `9d80b9ed882be70dd5e3ca7e0fbd76ac743129b9b15375d201155b5a75b3cef9` |
| `test/raft/learner-promotion-progress-proof-contract.test.js` | `dc6d943bc4276bf4ce39a2a837e5e476dcaad39c1789419d715b794f747f7282` |
| `test/partition/partition-service-learner-promotion.test.js` | `c56e17e9d32172701e2cd837ec183bee7df6e57279f11220d1ee3a43e88cdb52` |
| `test/partition/partition-service-learner-promotion-wake.test.js` | `1f2a7417c327689840ec6df1592fc540c26cf83a3945abfc84a33d17c7cf84bf` |
| `test/convergence/dt6-learner-promotion-progress-proof.test.js` | `5f2e5fd85f56146cf444447092cda871a79dc5adb7b1420cdb51a3ec0bc9e948` |

Design/source hashes and clean source status were checked again after this report. The report is independent design approval only; no receipt, source implementation or Quest disposition is approved.
