# U1 F1 independent source verdict — 2026-10-19

Reviewer: `subagent:/root/f1_independent_review`.

**Verdict: APPROVE the bounded F1 source correction. No F1 production repair is requested by this review. Bounded execution acceptance remains pending verification of the required source-only negative controls; this is not U1, U2, activation, merge, or release approval.**

The reviewer did not author or alter the candidate production code or tests and did not run a behavioral test locally. The review was completed before preparing any adversarial control variants. Those variants deliberately remove individual guarantees on separate WIP refs and cannot become the product candidate.

## Exact subject and authority

| Subject | Identity |
| --- | --- |
| F1 corrected source and complete positive test candidate | `77a888af01f13e30052135075964c6508b1d0b24` |
| Full candidate tree | `240db7714a4979c87aea8f70d28e20e9119f7359` |
| Candidate production tree (`src`) | `e0414db30f6d4dbd253e019fe0b0d02d27891024` |
| First published test-only checkpoint carrying the original independent races | `f088943e4c487c7f06827ffd93b0eed69de4afd7` |
| Its unchanged original production tree | `97388f76ab4468da91b4a7eb9badc8b3c1804e62` |
| Combined continuation reference checked for carryover | `8c9b14141f89872938d21cc35472b262929818d6` |

All four F1 production files are byte-identical at the combined continuation reference. The intent and CAS test files are also byte-identical. The combined handler test file contains later appended U1 inventory/hydration tests and must not inherit the complete-file positive result at the older F1 checkpoint. This verdict covers its existing F1 source interaction; it does not approve those later tests or the unimplemented F2–F6 correction.

Authority read: repository `AGENTS.md`, steering rules/router, applicable verification templates; runtime and authority/recovery contracts; the `wasm-creation-genesis` quest and recovery design R2-A/R3-E; the original independent F1 rejection; the corrective proposal; bounded finality design approval; and the prior source review and historical-red binding. Registered interactions are `service-instance-selection-resource-state` and `service-consensus-original-intent-admission` in `test/shards/impact-contracts.json`.

The approved proposal has SHA-256 `90d98bb2bae217faaeff848200bc684ccfc20a9ac4c2c1a22fc8b759b8a61d34`. Its reservation-finality section and witnesses are approved by `u1-reservation-finality-bounded-verdict.md`, SHA-256 `257a6177e931bbbcc0f1d586418ef6ad7f279049aa9fcf6df23f7a8aed58e6a8`. The broader correction's REVISE verdict remains separate and is not superseded here.

Complete source, dependency, fixture, record and historical-witness bindings are retained in `u1-f1-review-bindings-20261019.json`.

### Four changed production files

| File | SHA-256 at corrected candidate |
| --- | --- |
| `src/constants/service-instance.js` | `76e4ad3f69d360cad78fa454d1d80558c14559bbe301e34727ad44dce946fecb` |
| `src/control-plane/owners/service-instance-state.js` | `c0c582f02b2af52d5604fc0bc39c3da615da8ff452f24054fc6097a26fd6905b` |
| `src/control-plane/owners/service-instance-metadata.js` | `30fb6b1c2ddf15c7af1843c7a2e39e5345c10b041d128c6f58ad9b5c49c71aa3` |
| `src/service/service-consensus-creation-intent.js` | `382f426134ffa8303db98ee9b1428d8633c9727a8f0accb135f6a60f79092bbb` |

## Owner interaction and exhaustive finality census

The semantic question is whether the exact immutable reservation request can ever still be admitted. The deterministic resource-state owner alone supplies `SEALED`; neither the metadata wrapper nor the journal consumer infers it from outcome names. The one canonical enum is `SERVICE_INSTANCE_RESERVATION_REFUSAL` (`src/constants/service-instance.js:25-29`).

Full request and binding capture precede the finality decision. The metadata wrapper validates the tenant identifier and calls the existing full binding validator before reading the resource state (`service-instance-metadata.js:199-208`). In particular, a malformed binding cannot exploit the numeric selection-version comparison. The binding validator requires the exact fields, positive safe-integer version, request-id version relation, digests, incarnation and founding-peer shape (`service-instance-state.js:53-66`). Input capture rejects accessors and unsupported shapes through the existing bounded JSON owner (`service-instance-contract.js:36-79`); no new JavaScript-intrinsic hardening claim is made.

| Public reservation result path | Finality and assessment | Evidence |
| --- | --- | --- |
| No `service_instances` row has ever existed | UNRESOLVED. Absence cannot exclude a later selection. | Metadata `mutateResource:182`; wrapper `:212-214`; owner test “never-selected future binding”, `:576-596` |
| Valid binding absent from selected/retiring, supplied selection version greater than retained version | UNRESOLVED. The exact future selection can still happen. | State `:216-223`; independent future-selection race, intent test `:419-459` |
| Valid binding absent and selection version no greater than retained version | SEALED. Versions only advance; historical replay returns a recorded result without restoring selected state, and rows are retained. | State `selectionHistory:135-152`, `selectionAdmission:154-166`, `selectInstanceState:179-204`, `reserveResourceState:216-223`; metadata `:162-168`; owner test `:576-596` |
| Exact requested next ordinal below retained slot ordinal | SEALED. Ordinals cannot decrease; a removed binding likewise cannot regain selection. | State `:224-228`; owner test `:598-635` |
| Exact requested ordinal equals the retained ordinal but has a different winning operation | SEALED, carrying the actual winner token. | State `:229-232`; owner test `:605-608` |
| Same ordinal and operation with different immutable request content | SEALED. Retained winner content cannot become this request. | State `:233-234`; owner test `:609-610` |
| Exact matching reservation at the retained ordinal | ADMITTED, with the existing token and phase, including CLOSED and a retiring binding. It is returned before fresh-reservation exclusion. | State `:229-234`; owner test `:618-634`; existing closed-token controls `:120-148` |
| Matching retiring binding would require a new reservation | SEALED. A retiring binding cannot be reselected; exact previous admissions were already handled. | State `:236`; owner test `:625-634` |
| Exact next ordinal overflows the safe-integer counter domain | SEALED. This request cannot acquire a representable next ordinal. | State `:237`; contract `instanceCounter:29-31`; owner test `:615-617` |
| Future expected ordinal or currently occupied own slot | UNRESOLVED. Closure or ordinal progression can make this exact request admissible. | State `:238-240`; owner test `:611-614`; independent INVALID_EXPECTED_STATE race and handler paired witness |
| Another live slot temporarily holds the target replica | UNRESOLVED. Closure of that exact blocker can make this request admissible. | State `:241-244`; owner test `:637-647`; independent TARGET_ALREADY_OWNED race and handler paired witness |
| Capture, validation or admitted-slot encoding failure | UNRESOLVED. An encoding error is not ordinal-overflow proof. Capture/encoding cannot write metadata. | State `:245-249`; metadata `:208-214`; owner test `:649-670` |
| Unavailable or corrupt initial observation | UNRESOLVED with the existing diagnostic outcome. | Metadata `readState:36-48`, wrapper `:208-214`; owner test `:672-687` |
| Failed/unknown submission or unreadable resolution after it | UNRESOLVED unless the permitted fresh authoritative observation independently supplies a deterministic sealed fact. UNKNOWN does not cause a new semantic submission. | Metadata `submitState:56-79`, `settleSubmission:87-102`, `mutateResource:185-195`; failed gateway envelopes throw through `SystemMetadataOwnerBase.executeMutation:441-452`; owner test `:689-710` |
| Definitive zero-row CAS with fresh observations | Re-decides only through the same resource owner; at most nine submissions (`RESOURCES`), then STATE_CHANGED/UNRESOLVED. A failed definitive-zero reread stays UNAVAILABLE/UNRESOLVED. | Metadata `observeAgain:165-169`, `boundedChange:172-178`, `mutateResource:180-197`; owner test `:689-710` |
| Successful mutation or exact-history resolution | ADMITTED, no refusal tag. The wrapper does not rewrite positive evidence. | Metadata `:213-214`; state `:210-211,245-249`; existing lost-reply owner test `:170-192` |

These monotone facts remain safe if observed before a later legal transition: the later transition cannot restore an earlier binding or ordinal. Temporary state does not receive this treatment. A stale nonfinal answer may delay progress, but the next normal REMOVE retry re-enters the authoritative reservation path with the same request.

## Consumer custody, cancellation and concurrency

The old `SEALED_RESERVATION_REFUSALS` outcome-name set is absent. `reserveForRemoval` accepts cancellation only when the returned reservation has `reservationRefusal === SEALED` (`service-consensus-creation-intent.js:349-359`). An absent, unknown, or UNRESOLVED tag preserves the PENDING row and returns UNKNOWN with the original reason; source inspection of the exact string comparison covers unrecognized tag values, while the test exercises all twelve relevant outcome names both without a tag and with UNRESOLVED (`test/service/service-consensus-creation-intent.test.js:472-498`).

REMOVE reads and validates the original journal identity before calling the resource owner. It calls the same `reserveAndRetain` path with the journal's immutable binding and request, not a reconstruction from a current definition. No fresh runtime policy is used (`intent:372-388`; the negative policy assertions in the nonfinal and positive-cancellation tests are decisive).

ADMITTED is not returned to retirement until the exact token is captured, bound to the original request, written with the existing exact-intent PENDING predicate and authoritatively reread (`intent:153-174`; `operation-lifecycle.js:261-271`). An uncertain write keeps the original identity and cannot fabricate successful retention. `retainedToken` checks canonical bytes, IN_PROGRESS state and the expected token digest/ordinal/body before it is consumed (`intent:130-145`).

SEALED invokes the existing expected-state PENDING-to-CANCELLED mutation followed by one confirming reread. Cancellation never changes a PENDING row to FAILED. The identity is rechecked after the write, and a concurrent COMPLETED or FAILED journal winner is returned as TERMINAL_OPERATION with its row state (`intent:335-345`). The admission-write reread likewise returns independently observed terminal journal authority (`intent:167-170`). The operation journal's immutable row identity remains an existing invariant; F1 adds no row replacement or new durable store.

The decisive handler sequence runs each of the three real temporary cases through REMOVE: original journal durable, first reserve delayed, REMOVE_HELD, byte-identical PENDING row, no retirement before admission, real blocker closure or exact future selection, original request ADMISSION_RETAINED, persisted exact token visible at the runtime STOP seam, exactly one retirement, metadata CLOSED, and completed original journal (`test/node/runtime-service-bound-route.test.js:1036-1122`). Handler response classification consumes UNKNOWN as HELD (`src/node/runtime-service-bound-creation-route.js:49-56,395-405`) and retains REMOVING for coordinator retry (`:417-429`). The physical runtime in that test is explicitly scripted; the source does not claim this proves native physical custody.

## Historical-race and harness integrity

The independent historical suite at `a251ce4fd9c980a78c0fd33d8a5f873161f90870` records 33 tests, 30 passing and three actual behavioral failures. The extended TAP has the TARGET_ALREADY_OWNED, INVALID_EXPECTED_STATE and future-binding failures at lines 211, 230 and 251, with the exact obligation-loss assertions at lines 217, 236 and 257. Diagnostics show cancelled original journals and later admitted original resources. These are not import, setup or timeout failures.

The red checkpoint's 457-line intent test is byte-identical to the prefix of the preserved independent-complete file. The corrected candidate retains that entire prefix with only two nonsemantic line wraps, yielding 459 lines before the newly added helper/tests. Reversing exactly those two line wraps reproduces every original byte. The original race assertions and all scheduling gates are unchanged. Raw comparison results and SHA-256 bindings are in the accompanying JSON.

The historical assertions exclude the original bad conjunction; they are not, alone, a complete positive-progress oracle. The added handler tests explicitly require eventual ADMISSION_RETAINED, durable token ordering, one retirement and final CLOSED/completed state. Thus the corrected candidate cannot pass the paired sequence merely by suppressing all admission.

The SQLite fixture uses real production metadata owners, gateway, CDC mutation SQL and real SQLite CAS. Its authoritative read adapter is explicitly local component evidence. The original-intent fixture uses real journal SQL and records the invocation order; it does not claim replicated metadata, network partitions or process loss. Tests use explicit promise gates rather than timing sleeps. Handler draining is an existing bounded count of event-loop turns, not a runtime budget increase.

### Frozen complete test files at the corrected checkpoint

| File | SHA-256 |
| --- | --- |
| `test/control-plane/service-instance-creation-cas.test.js` | `89c957763a687fda76dd0ab25b8cda7eec31dcd831dfafa595c734fd2e81cead` |
| `test/service/service-consensus-creation-intent.test.js` | `f307c5996759cf401df56fc344b4a82905213bb7fe22dede99a0182062fcb7fc` |
| `test/node/runtime-service-bound-route.test.js` | `86db89475ed02c1362b0560c05cd4c22159cf56d145cdfb9bce97edd46ae6358` |

## Complete bounded review categories

| Category | Disposition and evidence |
| --- | --- |
| Owner interaction | APPROVE. One deterministic finality owner, one canonical tag, one journal cancellation consumer, same request across retries. Both sides are asserted together in the handler sequence. Registered endpoints and existing classified witness files cover the changed paths. |
| Admission/gating | APPROVE. Validated original request precedes finality; temporary refusal is held; exact token persistence precedes retirement; only explicit sealed evidence admits cancellation. Existing bounds remain unchanged. |
| Concurrency/serialization | APPROVE. Finality derives only from monotone state facts; exact SQL CAS and bounded re-observation preserve resource single-winner semantics. Post-write journal identity/terminal rereads remain authoritative. F2–F6 inventory/retirement races remain outside this subunit. |
| Recovery/replay | APPROVE for F1. Unresolved original PENDING bytes and operation identity are preserved; exact CLOSED reservation history does not reopen anything. Distinct-creation inventory representation and physical shutdown custody are not approved here. |
| Transport/delivery | APPROVE for the changed response contract. Unknown reservation/submission or missing replies cannot become final absence. Actual production message delivery, wake routing and bounded network latency are outside the component proof. |
| Harness fidelity | APPROVE source/oracle alignment. Real owner decisions in the historical races and positive handler ordering remain engaged. Scripted runtime and SQLite read seams are clearly bounded. Mutation execution is still required. |
| Formation circularity | No new formation dependency, initialization path or readiness bypass. Existing journal/metadata unavailability returns explicit uncertainty and retains custody. No formation-window timing or end-to-end cluster claim is conferred. |
| Retry loops | No new retry loop or timer. The existing resource CAS bound remains nine submissions; UNKNOWN is single-shot at the semantic layer. Coordinator REMOVE retry remains the continuation owner after HELD. |
| Hostile input | Existing bounded capture and exact-field validator remain the guard. Malformed binding/version/tenant inputs cannot produce version-based finality. Arbitrary trusted-host intrinsic/prototype replacement is not part of this bounded change. |

## Remaining execution gate

The parent reports recovery of lab job `psvensson/lagrange-lab#235` at exact `77a888af01f13e30052135075964c6508b1d0b24`: COMPLETE/PASS on tv-dator, 3/3 files, 123 reported assertions and exit code zero. That report is not silently promoted into independently inspected raw evidence here; the lab lane must supply the retained receipt/log and their hashes for an appended execution verdict.

The previous source verdict explicitly requires three independent controls on the corrected candidate with unchanged tests: seal temporary occupancy; seal an absent future binding; restore outcome-name cancellation for untagged refusals. The original delayed/future races and nonfinal-consumer assertion must fail for those deliberate regressions through the intended mechanism. An ordinary positive three-file run does not satisfy those controls. Controls must remain separate from the positive certification population and from the production candidate.

No local source test, native process test, mutation execution, complete owner cone, generated-metadata refresh, U1 combined verification, U2 runtime-progress verification, or release gate was performed by this reviewer. This record may be preserved append-only; any execution approval or correction belongs in a new record bound to its measured head.
