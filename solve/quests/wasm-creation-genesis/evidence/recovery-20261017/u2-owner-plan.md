# Recovery unit 2 implementation preparation

Prepared by `subagent:/root/prepare_recovery_u2` against lane `a251ce4fd9c980a78c0fd33d8a5f873161f90870` at `/workspace/scratch/6d2a7b72384f/lagrange`.

Status: **preparation only**. No production source/test edits, tests, lab jobs or commits by this preparer. Implementation requires root's explicit release after unit 1's independent verification/correction. Later unit-1 owner corrections supersede the cited source positions and must be incorporated before source edits.

Read: repository AGENTS/rules/router; the full recovery design including Revisions 1–5; CONTRACT-R2 and HANDOFF-INTERFACES; all six recovery vet reports; unit-1 report and both implementer briefs; relevant activation/discovery and serving/publication/retirement revisions; architecture ownership/recovery documents; all source owners listed below; the recovery embedding fixture and its unit-1 witness file. The approved latest revisions govern older vet recommendations.

## Approved behavior and owner map

| Boundary | Existing owner and source anchors | Unit-2 change or constraint |
| --- | --- | --- |
| Retained admission while metadata is unavailable | `src/service/service-consensus-creation-intent.js:184–204` | Already implemented in U1: retain ADMISSION_RETAINED with `phase: UNAVAILABLE`; the manager does not decide local permission. Reuse it. |
| Reopen's own metadata observation | `src/wasm-service/wasm-creation-opening.js:217–238` | On its own UNAVAILABLE result/throw, inspect exact local root/record through the existing by-path owner. Do not rely on the manager's earlier phase. PUBLISHED opens RETAINED SERVING/UNCONFIRMED; ADMITTED opens RETAINED HELD; absent unclaimed defers; absent claimed, retired, corrupt and conflicting remain their named permanent outcomes. |
| Journal-authoritative opening | `src/service/service-consensus-creation-intent.js:276–296,332–335,410–464` | Recommended narrow extension: `readRetainedCreation` returns validated `opening` via existing `inventoryOpening`/`confirmOpeningRecord`. See seam 1. |
| Exact local permission | `src/wasm-service/wasm-creation-opening.js:54–55,111–115,270–293,299–372` | Preserve all seven fields: format, groupId, replicaId, nodeId, token, opening, storage; preserve common binding validation. Reachable metadata ADMITTED + local PUBLISHED is CORRUPT_STATE before native port/writer open. |
| Resource acquisition/open | `src/wasm-service/wasm-service-replica-lifecycle.js:111–137,178–192` | Opening owner finishes permission before writable acquisition/native construction. Retained opens bind native creation subscriptions even when already SERVING, until this process confirms a grant. Transport registration remains after native/serving setup. |
| Serving/confirmation state | `src/wasm-service/wasm-service-serving-state.js:41–66,99–107,146–153` | New named GRANT_UNCONFIRMED open mode gives SERVING plus UNCONFIRMED. HELD remains non-serving. Leader effects remain one HELD→SERVING edge. Local publication/grant execution alone changes replica grant-confirmation state. |
| Native event admission | `src/wasm-service/wasm-creation-reconciliation.js:36–83` | Preserve synchronous enqueue-only callbacks. Before this process observes genesis, admit every APPLIED_PROGRESS, including replay completion. After observed genesis and last grant exactly UNAVAILABLE, apply the reviewed K policy to HELD and serving instances alike. Other outcomes keep existing admission rules. See progress-bound amendment draft. |
| Keyed confirmation run | `src/wasm-service/wasm-creation-reconciliation.js:88–99`; `src/wasm-service/wasm-creation-publication.js:65–93` | GRANTED marks replica confirmation and the per-process first-confirmation latch. First confirming retained run emits exactly one OBSERVED wake even when waited/no serving flip, then unbinds. Fresh waited/flip suppression stays unchanged. Add current(context) recheck immediately after the awaited publication helper and before latch/wake mutation. |
| Local lifecycle currentness | `src/wasm-service/wasm-creation-reconciliation.js:36–40,122–162`; `src/wasm-service/wasm-service-lifecycle.js:222–280,426–435,640–653,748–763` | Existing exact registry object, native port, captured creation and READY/closing checks remain the authority. Keep failed unsubscribe/cleanup obligations reachable. U1 corrective retirement joining must be incorporated. |
| Bound START vocabulary | `src/service/service-consensus-bootstrap.js:14–25,55–94`; `src/runtime/wasm-component-driver-consensus.js:27–65` | Add PUBLISHED_UNCONFIRMED explicitly to driver/runtime whitelist and exact binding/token/started validation. No widened “not failed” condition. |
| Operation-authority confirmation | `src/service/service-consensus-bootstrap.js:95–107,141–194` | Existing `confirmPublishedAuthority` remains the sole operation confirmation. Exact PUBLISHED = confirmed; contradicted = existing exact retirement; unavailable = PUBLISHED_UNCONFIRMED for every serving answer including PUBLISHED_UNPROJECTED. Other unresolved reasons retain existing UNKNOWN mapping. It must not mutate the replica's grant latch. |
| Discovery projection after late confirmation | `src/runtime/service-runtime-consensus-bootstrap.js:21–32`; `src/runtime/service-runtime-consensus-publication.js:85–105`; `src/service/adapters/runtime-service-adapter.js:94–105` | Current runtime projection precedes manager authority confirmation. Upgrading unconfirmed to PUBLISHED must run the existing projector before ACTIVE. See seam 2. |
| Handler memo/wake | `src/node/runtime-service-bound-creation-route.js:41–43,115–170,308–370` | PUBLISHED_UNCONFIRMED → HELD memo and CREATE_HELD/CREATING vocabulary until activation changes B9. U1 already records every GRANT_HELD with exact `grant.outcome===UNAVAILABLE` in every memo state without re-entry/wakePending. Reuse it and incorporate U1 lifetime fencing. |
| Crash/host fixture | `test/wasm-service/bound-creation-handler-embedding-fixture.js:159–193,217–290,327–353` | Gateway faults; new boot incarnation; real all-three-host child process with shared file-backed component DB and exact directory reuse. See C9. |
| Startup cleanup receipt | `test/wasm-service/bound-creation-restart.integration.test.js:574–608`; `src/entrypoint-startup-acquisition-ledger.js:45–73` | U1 already owns P-R15 ledger witness. Reuse verified evidence; do not invent another process-owner mechanism. |

## Seam 1: opening requires the original journal claim before classification

The by-path inspector already expects the exact original opening claim. The normal captured bootstrap drops it, and `readRetainedCreation` currently returns only intent/token. A memo or services row cannot supply the missing authority. Calling `claimConsensusCreationOpening` first is also wrong for an absent unclaimed file during an owner outage: it would mutate `opening_json` before knowing local permission.

Recommended amendment: add the already validated original `opening` to the existing journal-only `retainedRowAnswer`, using `inventoryOpening(row, intent, token)`. In the opening owner's UNAVAILABLE branch, read this retained creation through `consensusOpeningOwner.readRetainedCreation(operationId)`, check that intent/token/operation still equal the captured creation, and invoke `inspectRetainedWasmCreation` with that exact opening. Only local ADMITTED or PUBLISHED proceed to the normal claim, which still validates/reuses the recorded claim. ABSENT_UNCLAIMED defers with no claim write; ABSENT_CLAIMED refuses missing storage.

Do not add the mutable null→claimed opening to `captureConsensusBootstrap`'s stable origin object: `sameLiveCreation` (`wasm-service-lifecycle.js:93–96`) hashes the captured creation and would misclassify a legitimate live re-entry after the claim appears.

Witnesses: outage + absent unclaimed leaves no file and opening_json null; outage + intact claimed records retains the exact claim; malformed/foreign claim refuses before writable open; live re-entry keeps the same captured creation/replica; reachable ADMITTED + local PUBLISHED refuses before writer/native port acquisition.

## Seam 2: manager confirmation needs the existing runtime projection verb

Current order is manager continuation → adapter create/start → runtime start → driver/lifecycle → runtime projection on PUBLISHED → manager authoritative confirm. The new PUBLISHED_UNCONFIRMED intentionally skips runtime projection, so a manager-only status upgrade falsely reports ACTIVE.

Recommended narrow amendment: expose the existing runtime-owned projector through the existing adapter chain as a projection verb for the same captured origin and confirmed bound result. `confirmPublishedAuthority` invokes it only when a formerly unconfirmed result becomes authoritatively confirmed. It performs no second metadata confirmation, no second START/genesis/grant run, and no direct projection writes from the manager. The projector still returns PUBLISHED or PUBLISHED_UNPROJECTED; only actual PUBLISHED leads to manager RUNNING and handler ACTIVE. An absent/failed projection capability stays typed unprojected/held, never assumed present.

An alternative is to restructure the whole start path so the same sole confirmation precedes projection, but that changes a wider existing interaction. Do not silently introduce another confirmation owner or treat metadata confirmation as a projection receipt.

Witness: opening and publication grant see UNAVAILABLE, while the owner returns only for manager confirmation. Assert real services/endpoint writes at the new boot incarnation and the exact token-keyed PRESENT mark before ACTIVE. Failed/retained projection remains HELD; contradiction takes exact retirement; wrong token fails; manager confirmation does not change the replica's process grant latch.

## Confirmation initialization and edge ownership

Reachable local PUBLISHED reopen may serve immediately, but a START before this process has successfully run genesis/grant must still answer HELD (P-R2). Outage local PUBLISHED instead answers the explicitly unconfirmed serving status even if the initial genesis run is HELD. Therefore “serving” alone cannot stand for “this process confirmed.”

Use named initial state, not a new raw-null decision sentinel. A possible local representation is PENDING / UNCONFIRMED / CONFIRMED plus the reconciliation owner's explicit first-success state; choose one coherent representation so duplicated facts cannot drift. PENDING means no successful keyed grant in this process and no outage claim has been made. Publication GRANTED alone confirms the replica. Manager metadata confirmation is an operation/publication fact and cannot substitute for that run.

After `await publishWasmCreation`, the reconciliation owner currently checks only STOPPED. Recheck the same `current(context)` before setting new confirmation/wake state. The helper checks before its own local mutation; a second check protects the caller's new post-await effects against stop/replacement between those continuations.

One approved precision must remain unchanged: the K predicate is last grant **exactly UNAVAILABLE**. The publication helper currently loses some `reason` detail when it returns HELD; `UNKNOWN {reason: UNAVAILABLE}` is not the same outcome. Gateway outage injection already produces the exact UNAVAILABLE class. Record this limit rather than silently expanding the rule to every unknown grant.

## Witness and mutation plan

| Witness | Required observation | Counterexample/mutation |
| --- | --- | --- |
| P-R2 | Reachable retained PUBLISHED reopen before formation answers HELD, later confirms, emits exactly one OBSERVED wake and ACTIVE with PRESENT/new boot endpoint. | Unbind at open; retain waited/no-flip wake suppression. |
| P-R3 | Owner-down local PUBLISHED serves unconfirmed with HELD memo; native progress after return confirms without explicit re-entry at the reviewed bound. | Treat UNCONFIRMED as CONFIRMED; remove K trigger. |
| P-R3b | Owner-down local ADMITTED remains HELD; absent unclaimed defers without file/claim write. | Skip original claim; grant ADMITTED serving; claim before inspection. |
| P-R3c | N qualifying real committed writes/progress units (per reviewed amendment) cause at most ceil(N/K) keyed runs, zero immediate handler re-entry and no outside journal reads. | Remove filter; re-enter on GRANT_HELD(UNAVAILABLE). |
| P-R3d | Contradiction at manager confirmation retires exact original creation. Admission-time RELEASING/CLOSED remains permanent RESOURCE_CLOSED with later coordinator REMOVE. | Conflate unavailable/contradicted; self-retire during opening. |
| P-R3e | The APPLIED_PROGRESS completing unobserved genesis is admitted. | Apply K filter before genesis observed. |
| P-R3f | One serving-unconfirmed leader + two restarted ADMITTED/HELD followers all obey K costs; after return all grant/ACTIVE and wake once. | Apply bound only to serving; record unavailable wakes only for serving memo. |
| P-R3g | Known zero counter phase, no formation event, insufficient progress after owner return stays unconfirmed; explicit re-entry confirms. | Invent timer; assume owner return resets an unobservable counter. |
| P-R3h | Confirm-time UNAVAILABLE maps every serving answer, including PUBLISHED_UNPROJECTED, to PUBLISHED_UNCONFIRMED/HELD. | Incomplete serving-status mapping. |
| Late-confirm projection | Owner returns only at manager confirmation; real discovery projection and exact mark precede ACTIVE. | Status upgrade without projector. |
| Post-await currentness | Stop/replacement between helper publication and caller continuation leaves no late latch/wake effects. | Omit caller current(context) recheck. |
| P-R10 / C9 | Real child death and all-three-host restart, preserved journal/common root/peers/log/writer/ordinals and exact INIT semantics. | Substitute orderly host teardown or synthetic child-success claim for observed SIGKILL. |
| P-R15 | Existing startup ledger with failed cleanup retains exclusive owner; no next inventory. | Release lock after failed ordinary cleanup. |
| Batched native progress | Required if stronger progress-count choice is selected; one real batched event crosses K. | Count notifications instead of native-owned progress. |

Use red-first mutation evidence with byte-identical restoration, classified runners and existing static/impact gates. Do not raise baselines or broaden optional tests after the owner cone resolves. All relevant test/rules files must be read before implementation/testing starts.

## Existing witness supersession census

`test/wasm-service/wasm-creation-publication.integration.test.js` P6a at lines 541–558 currently expects zero native subscriptions immediately after retained open and zero wakes. Append the successor assertion/comment: subscriptions remain until the first confirming retained run, then exactly one OBSERVED wake and zero subscriptions. Preserve the remaining immutable-root/journal assertions.

Do not change the unrelated zero-subscription-after-shutdown assertions or fresh P17 waited-start wake suppression at lines 853–865. U1's absent-unclaimed outage witness at `bound-creation-restart.integration.test.js:612–635` remains valid; a journal-only opening read is not a second metadata read. U1's P-R7 fallback explicit re-entry remains historical; the new P-R2 proves automatic confirmation wake.

## C9 implementation shape

Extend the existing embedding fixture with explicit reusable directory/component-database options while preserving its ordinary test defaults. `createCreationSqliteFixture` already accepts `databasePath`; schema setup is idempotent. The child must host all three founding replicas and their shared file-backed component DB. The parent owns final cleanup and never substitutes fixture `stopHost`/`restartHost` for process death.

Parent observes local PUBLISHED and durable evidence through a second read-only DB connection while the child remains alive; IPC may coordinate the fixture, but is not the durability receipt. Parent sends SIGKILL to the exact child PID and awaits child close with `signal === 'SIGKILL'` and `code === null`. It then restarts all three hosts over the same component DB and exact directories with higher boot incarnations, re-forms native RF3, and verifies identity and writer continuity from the original journal.

Do not reconstruct a fresh selection/creation merely because fixture inputs are deterministic. Supply original retained intent from actual journal evidence to restarted hosts, assert no new selection, and keep ordinal/admission/opening unchanged. Check common binding, physical peers, durable log/hard state, writer state and original INIT. A foreign old incarnation INIT is refused; the exact retained INIT remains idempotent. Re-project endpoints at current boot incarnation and require PRESENT for each new replica object.

This proves a process crash with uncheckpointed WAL, not machine power loss or native metadata-quorum outage. Gateway faults remain component-owner read outages. Reuse verified P-R15 for startup cleanup ledger custody.

## Pending gates and decisions

1. Unit 1 independent review and corrective implementation/verification, including reservation finality and the newer inventory/multi-creation/retirement completion findings.
2. Independent approval of the exact progress-bound amendment (`u2-progress-bound-amendment-draft.md`); no silent weakening.
3. Root selection/review of the two narrow opening/projection seams described above. These keep the existing authorities; they do not authorize another claimed-opening or confirmation owner.
4. C9 fixture ownership/options and actual child execution under the classified lab runner.
5. Production startup inventory/journal availability, B9 workflow retry, old endpoint sweep and activation remain in the activation quest, not silently added to U2.
