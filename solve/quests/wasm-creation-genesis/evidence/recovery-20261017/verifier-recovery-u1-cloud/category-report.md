# Recovery unit 1 independent category report

Verifier: `/root/verify_recovery_u1`. Subject: `a251ce4fd9c980a78c0fd33d8a5f873161f90870`; implementation comparison: `381750de29af647d446b19adedf1da53eb712093..a251ce4fd9c980a78c0fd33d8a5f873161f90870`, all 31 changed paths under `src/` and `test/` (17 production JavaScript files, nine test/fixture JavaScript files, five classification/impact JSON files). Workspace: `/workspace/scratch/6d2a7b72384f/verify-recovery-u1`. Evidence paths below are relative to `/workspace/scratch/6d2a7b72384f/verify-u1-evidence` unless a repository path is named.

**Category verdict: REJECT.** The candidate meets many single-creation restart properties but fails six reachable interaction properties described below. This is an independent review of the actual candidate. Historical design vets were read as binding records; I did not perform those vets or implement unit 1. Unit 2 is excluded, including offline local-grant admission, its reconciliation cadence, and the actual child-process crash proof. No correction is approved by this report.

## Frozen claim and boundaries

The frozen unit-1 claim is recovery design claim items 2–6 plus R1-A/B/D/E/F/G/H, R2-A/E/F, R3-B/C/D/E/F, R4-A rule 2, and the Revision 5 supersessions. Revision 5 governs, then Revisions 4–1 and the original draft. The governing custody text is `ACTIVATION-DISCOVERY-DESIGN-20261017.md` RV5–RV7; CONTRACT-R2 and HANDOFF constrain the embedding. The manager's phase-UNAVAILABLE pass-through is in scope. The local admission function and bounded-progress behavior assigned to unit 2 remain outside this claim.

The proof uses the classified single-file runner with its thermal check, real SQLite journal/resource authority, real WASM raft-rs application groups, actual local files and exclusive process owners, and real runtime services/endpoint projections. Its metadata consensus is component SQLite and its transport is queued loopback. Orderly host reconstruction is not SIGKILL, WAL recovery, or a production formation proof. Those ceilings apply equally to the implementation's tests and my additional tests.

## Blocking findings

### F1 — Cancellation is inferred from refusals that do not exclude later admission

Categories: admission/gating, concurrency, recovery, owner interaction. Source: `src/service/service-consensus-creation-intent.js:48-52,359-382`; authoritative distinctions: `src/control-plane/owners/service-instance-state.js:211-241`, and `src/control-plane/owners/service-instance-metadata.js:180-210`.

The caller's `SEALED_RESERVATION_REFUSALS` treats `TARGET_ALREADY_OWNED`, `INVALID_EXPECTED_STATE`, and every `STALE_BINDING` as irrevocable. These outcomes can describe temporary occupancy, an ordinal whose predecessor has not closed, or a binding whose exact selection has not happened yet. Cancelling the PENDING row does not fence an earlier delayed copy of its exact reserve request.

Three independent component witnesses delay the original request after its journal intent is durable but before authority invocation. REMOVE-time resolution cancels it. The real prior resource is then closed, or the exact future binding is actually selected; releasing the delayed original request makes the real owner admit it. Final state is a CANCELLED journal with null admission JSON, an ADMITTED authoritative resource for that same operation, and no recoverable journal entry. No owner decision is stubbed. The future-binding test computes a prospective deterministic binding and confirms exact equality with the later real SELECTED result; that computation grants no authority and does not replace a receipt.

Evidence: `independent/service-consensus-creation-intent.test.js.extended.runner.log:226,245,266`; final authoritative diagnostics at `:237,256,277`; `independent/reservation-races.js` and `independent/reservation-future-binding.js`.

Required class closure: the resource authority must explicitly distinguish an exact request that can never be admitted from a current refusal. PENDING custody must survive every nonfinal answer and every ambiguous request in flight. Removing just the two occupancy strings from the copied set is insufficient.

| Existing refusal | Exact-request finality in current authority | Evidence / qualification |
| --- | --- | --- |
| TARGET_ALREADY_OWNED | Nonfinal | Other occupied slot can close; real witness admits original unchanged request afterwards. |
| INVALID_EXPECTED_STATE | Nonfinal in general | Prior ordinal can close or current ordinal can catch up; real witness covers closed-predecessor progression. |
| STALE_BINDING | Mixed | Future selection and NEVER_CREATED are not future exclusion. An absent binding at an already passed selection version, or a new reservation in a retiring instance, cannot become selected again. The owner has the distinguishing state; the caller does not. |
| HISTORY_UNAVAILABLE | Final for exact validated request at the reserve state function | Requested ordinal is strictly below the current monotone ordinal of that binding/slot; future increments cannot make it admissible. |
| CONFLICT | Final | That exact ordinal already has a different immutable operation winner. |
| CONTENT_CONFLICT | Final | That exact ordinal and operation already have different immutable request content. |
| CAPACITY_EXHAUSTED | Ordinal overflow is final; do not generalize an arbitrary encoding error | Current reachable valid-state bounds are comfortably below STATE_BYTES: 16×4608 + 2×4096 + 18×1024 = 100352 bytes before small envelopes, versus 131072. The metadata adapter also uses this spelling for encoding failure, so any new finality contract must preserve the provenance of that answer. No transient capacity reproduction is claimed. |
| UNAVAILABLE / UNKNOWN / STATE_CHANGED | Nonfinal | No proof of future exclusion; preserve PENDING and a retryable, named result. |

### F2 — Startup inventory has neither a one-shot owner nor an irreversible lifetime fence

Categories: recovery/replay, concurrency, retry, admission. Source: `src/node/runtime-service-restart-inventory.js:159-176`, `src/node/runtime-service-handler.js:424-425,963-975`.

A scan suspended after its authoritative journal read can resume after handler/lifecycle shutdown and after a genuine successor acquires the same directory's process owner. It rebuilds the dead handler's memo and invokes `resumeConsensusCreation` for the old process. The independent witness observes that invocation and the reconstructed named failure memo. It does not claim the closed lifecycle actually opened or served.

The same owner gap exists without shutdown: two inventories begun before ready run independently. The second reaches ACTIVE; the delayed first then overwrites ACTIVE with HELD. This is a direct stale-snapshot overwrite, not a speculative race. Merely checking a STOPPED flag would not solve the concurrent still-live scan.

Evidence: `independent/bound-creation-restart.integration.test.js.extended.runner.log:147,159,193,207`; `independent/restart-races.js`; `independent/inventory-overlap.js`.

Required class closure: one startup task/cache per handler lifetime, irreversible cancellation on stop, and validation after every asynchronous boundary and before memo/queue writes. A suspended read-only scan need not block shutdown forever; it must lose all ability to mutate or enqueue after cancellation. Already admitted physical work is a separate obligation under F4.

### F3 — Retirement redrive bypasses the coordinator REMOVE single-flight

Categories: concurrency, retries, owner interaction. Source: `src/node/runtime-service-restart-inventory.js:108-145`; `src/node/runtime-service-handler.js:597-692`.

A RETIRED plan is queued after ready. A coordinator REMOVE can acquire the handler's removal entry in that gap. The scheduled redrive then unconditionally inserts another entry under the creation id and calls the bound stop concurrently. The same canonical replica enters `manager.stopReplica` twice while the first stop is deliberately pending. Current idempotent lower owners allow both to finish; the witness emits only the correctly named coordinator outcome and shows no double physical corruption. The defect is bypass of the promised serialization owner, not a claim of an observed duplicate durable mutation.

Evidence: `independent/bound-creation-restart.integration.test.js.extended.runner.log:169,183`; direct count is two concurrent entries, expected one. A duplicate row observed across the scan's separate PENDING and IN_PROGRESS queries reaches the same ungated redrive class. Dedupe may collapse repeated observations of one operation; it must not discard distinct predecessor/successor operations (F5/F6).

Required class closure: acquire the existing canonical removal owner synchronously, preserve exact creation identity, and leave an admitted coordinator REMOVE in custody. A redrive may not invent a coordinator request or emit its completion.

### F4 — An admitted by-path retirement can write after process ownership transfers

Categories: concurrency, recovery, owner interaction, harness fidelity. Source: `src/wasm-service/wasm-service-lifecycle.js:483-484` and `shutdownAll`; `src/wasm-service/wasm-creation-retirement.js:120-165`.

This is the already-admitted counterpart of F2. `retireReplica` returns an untracked retirement promise. With no live replica object, `retireLocally` awaits metadata release and then opens/tombstones the local path. `shutdownAll` joins active/retiring replica objects, but not this pending by-path retirement.

The independent witness starts with a real published local file and a rebuilt lifecycle with no active replica. It pauses the metadata-release call, requests shutdown, and observes shutdown finish and release the real process owner. A successor actually acquires that directory. Releasing the pending old task then produces RETIRED on disk and CLOSED in authority under the old composition. This demonstrates a post-transfer durable effect, unlike the narrower F2 enqueue finding.

Evidence: `independent/bound-creation-restart.integration.test.js.extended.runner.log:216,230`; `independent/retirement-shutdown.js`.

Required class closure: the lifecycle that admits exact-resource retirement must own/join that operation until completion, reject new retirement after its closed gate, and prevent process-owner release while an admitted retirement can still touch the path. A queued-callback fence alone is insufficient. The underlying lifecycle gap predates the new startup redrive, but is reachable through the new unit's claimed process-custody boundary and must be resolved before that claim is accepted.

### F5 — A historical closed predecessor is declared completed by the route while its journal never completes

Categories: recovery, owner interaction, projection authority. Source: `src/node/runtime-service-bound-creation-route.js:374-385`; `src/runtime/service-runtime-consensus-publication.js:116-131`; `src/service/service-consensus-bootstrap.js:118-134`.

A predecessor can be locally RETIRED and metadata CLOSED while its creation row remains IN_PROGRESS because the final journal write failed (the design's crash point 5). Once its remaining resources close, selecting a successor legitimately drops that predecessor instance from selected/retiring state. A replayed close then answers HISTORY_UNAVAILABLE.

The handler maps `retired:true + CLOSE_UNRESOLVED + close.HISTORY_UNAVAILABLE` to COMPLETED. In contrast, the runtime's STOPPED projection and the manager's creation-row completion both require `closed === true`. The restart redrive therefore settles without completing the old row. Every later scan sees the old obligation again; no repaired journal receipt exists.

Evidence: `independent/predecessor-successor.runner.log:141-180`; first ordering's actual old row is `in_progress`, expected `completed`, while the real successor independently enters HELD. Setup uses the same labelled completion-write crash as P-R7, real closes of every predecessor resource, and a real SELECTED successor. No metadata state is manufactured.

Required class closure: reconcile the typed retirement completion contract across lifecycle/runtime/manager/route. A proven historical closure must discharge discovery/journal custody consistently, while an ambiguous close must retain it. Do not add a handler-local inference that bypasses the physical/metadata owner.

### F6 — A single last-written replica memo discards distinct recoverable creations

Categories: recovery, admission, concurrency, owner interaction. Source: `src/node/runtime-service-restart-inventory.js:64-66,130-145,166-174`; route memo settlement at `src/node/runtime-service-bound-creation-route.js:102-129`.

The same legitimate predecessor/successor setup yields two rows for one canonical replica. Inventory writes both into `localReplicas[replicaId]`; the last scan row wins. Startup reentry then requires that one memo still name the creation. If the successor sorts first and predecessor second, the predecessor replaces the successor memo; its redrive eventually leaves REMOVED for the predecessor, and the successor is never resumed. All resource/journal identities are valid. Equal creation timestamps are legal; operation-id lexical ordering chooses the two cases without rewriting an authoritative state transition.

Evidence: `independent/predecessor-successor.runner.log:188-227`; the diagnostic has plans `[J REENTER, I REDRIVE]`, resumes `[]`, memo REMOVED(I), and both rows IN_PROGRESS. The opposite order is also run; it exposes F5 while preserving J's reentry. Snippet: `independent/predecessor-successor-inventory.js`.

An additional independently measured pair removes the local-file distinction: both the old closed-but-uncompleted creation and the legitimate successor are ABSENT_UNCLAIMED/REENTER. Predecessor-first leaves the successor HELD; successor-first runs only the predecessor and leaves FAILED(predecessor), with no successor invocation. Evidence: `independent/older-reenter-inventory.runner.log:141-199` and `independent/older-reenter-inventory.js`. Thus the proposed REENTER preference is disproved by an actual execution, not only source reasoning.

Required class closure: every distinct retained creation keeps its own recovery obligation and canonical owner path. The visible replica memo must not discard a live successor or become obsolete solely because of scan/await order. This cannot be fixed by deduping on replica id, simply taking the last row, or prioritizing REENTER over REDRIVE: older absent creations can also plan REENTER, and a future PENDING intent is not current resource authority. Further owner-design review is required for the multi-creation representation and its relation to the existing custody table.

## Owner/caller census

Raw, independently generated source/test searches are in `census/{scan,identity-local-owner,completion-terminal,start-outcomes,wake,retirement-lifetime}.txt`; the exact changed path list is `census/changed-files.txt`.

| Question | One owner / callers and assessment |
| --- | --- |
| Enumerate journal work | Manager `_readRecoverableOperations` -> `recoverPendingOperations` -> consensus row inventory. One entry point, two existing state queries. Generic rows use the unchanged resolver path; handler passes a null resolver and leaves them untouched. No production activation caller exists yet. |
| Inspect receiver-local identity | Handler -> manager `inspectRetainedCreation` -> adapter -> runtime -> driver -> lifecycle -> `inspectRetainedWasmCreation` / `inspectWasmCreationLocal`. Only the opening module reads the path; read-only connection closes in finally before any opening. Base adapter/runtime fallback is typed UNSUPPORTED. |
| Permit physical opening | Existing `resolveWasmCreationAdmission` in the opening module. The inventory supplies evidence, never grants permission. Unit-2 logic is not partly implemented here. |
| Decode retained row / terminal state | Manager facade calls `readRetainedCreation`; production direct consumer is the bound REMOVE route. COMPLETED/CANCELLED map to REMOVE completion, FAILED to failure; CREATE terminal remains permanent. Unrelated lower-case `terminal_operation` enums in other owners are not this contract. |
| Resolve PENDING removal | `resolveRetainedReservation` owns journal promotion/cancellation, but improperly copies authority finality (F1). Route's NOT_ADMITTED branch calls it once with the original operation, never constructs a new reserve identity. |
| Complete creation | Single `completeConsensusCreation` CAS in the intent module; sole production caller is the manager's bound retirement after runtime stop. F5 identifies the disagreement about what reaches that caller. |
| Confirm typed START refusal | Runtime `startConsensusBootstrap` and manager `continueRetainedCreation` call the same `confirmConsensusBootstrapResult`. Five permanent outcome codes form a closed whitelist; UNAVAILABLE becomes named UNKNOWN/UNAVAILABLE; arbitrary lifecycle codes remain deferrals. |
| Changed lifecycle start outcome | WASM driver generic and bound starts consume the lifecycle result; meta-service wrapper forwards it. Service adapters/generic recovery/reconciler remain separate existing consumers. Full touched lifecycle and driver suites were run; driver failure signature was compared with the exact base. |
| Wake reason/detail | `deliverWasmCreationWake` supplies reason, token and grant detail; handler `onCreationWake` -> one `consumeCreationWake` table. GRANT_HELD/UNAVAILABLE is recorded for any memo and creates no in-flight pending wake. Other legitimate grant-held/progress wakes preserve previous behavior. |
| Memo and runtime custody | Handler owns the cache, with route settlement and startup reconstruction as entry points. Reconstruction must respect lifetime and distinct obligations (F2/F6). Existing REMOVE tracker is the serialization owner (F3). Lifecycle owns admitted exact-resource work across shutdown (F4). |

## Checklist completion (all applicable items)

Every entry below identifies concrete evidence and the scope of the result. “No new” is a scope determination, not a missing test. Positive suite logs are under `runs-node22/`; exact test paths are named so individual assertions can be located without a screenshot.

### Admission / gating

| Item | Evidence and assessment |
| --- | --- |
| A1 Precheck/enforcement | Restart local inspection is explicitly nonauthoritative; physical permission still passes `resolveWasmCreationAdmission`. R3-B in restart suite measures both manager and opening reads. P-R9 checks inspection refusals versus open-time refusal. |
| A2 Transient/terminal | F1 rejects false cancellation finality. Route R1-B/R3-C and R3-D tests cover permanent open codes, transient lifecycle code, UNAVAILABLE, and terminal row state; mutation M13 targets arbitrary-code widening. |
| A3 Budget | No new duration or retry budget. One startup scan and one queued start per admitted creation; external retry remains the caller's existing duty. The closed-lifetime gap is F2/F4, not grounds to increase a budget. |
| A4 Reason shape | Driver carries lifecycle `.outcome`/diagnostic `.code`; one confirmer whitelist maps it. R3-B tests named UNKNOWN/UNAVAILABLE; route R4-A/R5-A tests nested `wake.grant.outcome`. |
| A5 Hold release | P-R4 resumes ADMITTED local/PUBLISHED metadata; P-R5 redoes retirement; wake test records unavailable grant and reenters for predecessor outstanding. Production B9/cross-node release latency remains activation/certification scope. |
| A6 Freshness | F2 demonstrates stale scan clobber; F1 demonstrates stale refusal becoming false. Physical owner reads remain fresh per continuation. |
| A7 Message honesty | P-R1/P-R13 and RV5–RV7 route tests pin creation operation id versus request id; P-R11 pins NOT_READY/deferRetry and no emitted outcome. F6 shows lost custody despite valid individual identities. |

### Retry / redrive

| Item | Evidence and assessment |
| --- | --- |
| R1 Retry fires | P-R5 plus M05 exercise scheduled RETIRED redo; F6 rejects discarded distinct successor reentry. |
| R2 Frozen/unreadable bound | No repeating scan loop: malformed rows produce typed INVENTORIED/CORRUPT entries or row-local failure; service R2-E ensures one bad row does not terminate the scan. Unreadable metadata defers rather than proving completion. |
| R3 Stops loud | Unreadable entry and retirement decisions have named logs; a skipped held-memo gate is covered by F2/F6 and cannot serve as durable discharge. Terminal/refusal mapping is covered in route tests. |
| R4 Mutual suppression | Enqueue-only wake avoids awaiting a new run from inside that run. F3/F6 reject overlapping custody and lost work. Offline quiet-group release belongs to unit 2/activation, with explicit reentry still available. |
| R5 Storm ceiling | Unit 1 adds one scan/one immediate plan, no periodic loop or enlarged timer. Existing in-flight pending wake coalesces to one follow-up; unavailable-grant wake adds none (M11). Repeated inventory lacks a bound until F2 is fixed. |
| R6 Duplicate effects | P-R7 exercises all five retirement boundaries; exact token/local CAS/metadata phase transitions protect physical idempotence. F3 rejects bypass of the shared single-flight despite those lower protections. |
| R7 Reset semantics | No attempt counter or ACK-based reset added. Startup latch lifetime is the relevant reset and fails F2; host reboot uses a new boot incarnation. |

### Transport / wake

| Item | Evidence and assessment |
| --- | --- |
| T1 ACK versus processed | New inventory does not read transport ACKs. Fixture's retired native address explicitly answers `{acknowledged:true,noHandler:true}`; handler dispatch returns the actual handler result. Wake DELIVERED means handed to consumer, not authority confirmation. |
| T2 Late responses | No new SERVICE_RESPONSE waiter added. F1 tests the relevant delayed authoritative reply; it cannot erase journal custody. F2/F4 cover deferred work after lifetime retirement. |
| T3 Outcome classification | NOT_READY ERROR + errorCode + deferRetry tested in P-R11 and route R1-H/R2-F. Typed transient START failure stays named and retryable; five permanent codes do not gain deferRetry. |
| T4 Undeliverable bounds | No new awaited remote delivery in unit 1; wake consumer is enqueue-only. Missing consumer returns CONSUMER_ABSENT, throwing consumer UNDELIVERED. Production remote delivery/caller timeouts are outside this embedding ceiling. |
| T5 Stub fidelity | Queued native loopback and direct handler dispatch are stated fixture seams; actual emitter and projection owners are used. This is not an end-to-end message-router contract or production network claim. |

### Recovery / replay

| Item | Evidence and assessment |
| --- | --- |
| P1 Live state not clobbered | F2 and F6 are direct counterexamples. Writers censused: inventory `localReplicas.set`, route `settleCreation`, removal settle/redrive, and in-flight map insertion/deletion. |
| P2 Restart/live discriminator | `awaitsRestartInventory` opt-in correctly scopes initial message gating while production activation remains unwired; no one-shot inventory/lifetime discriminator exists (F2). |
| P3 Enlistment | No participant registry is reconstructed here. Immutable retained intent preserves founding peers and exact token through manager/driver; P-R1 reentry uses that origin. No empty-registry authority is invented. |
| P4 Replay idempotence | P-R7/12/12c plus journal CAS tests; row completion only after retirement. F5 rejects the historical closure residue and F6 rejects dropping another operation. |
| P5 Absence not completion | Missing claimed file permanently refuses reopening; missing file retirement is typed absence, not an inferred tombstone (P-R1b/P-R9, M06). Unknown row/read keeps custody. F1 is the false-finality exception. |

### Concurrency / serialization

| Item | Evidence and assessment |
| --- | --- |
| C1 Synchronous gate | Normal CREATE and REMOVE tracking are synchronous; startup redrive bypasses existing REMOVE ownership (F3). |
| C2 Post-await validation | F1 late reserve, F2 late scan, F4 paused by-path retirement demonstrate three distinct asynchronous boundaries; F6 covers ordered scans and settlement ownership. |
| C3 Single winner | Journal intent/admission/opening CAS and authoritative slot CAS preserve exact immutable identities. F1 incorrectly discards custody around those winners; F5 disagrees about terminal proof. |
| C4 Callback reentrancy | Inventory outer setImmediate and route inner setImmediate can interleave with REMOVE/shutdown. P-R14 proves normal REMOVE preemption; F2/F3 prove omitted lifetime/retirement cases. |
| C5 Key honesty | Creation id owns CREATE reentry, canonical replica owns REMOVE serialization, exact physical token/path owns actual retirement. F3 mixes independently tracked remove ids; F6 conflates distinct creation obligations through one canonical memo. |

### Harness fidelity

| Item | Evidence and assessment |
| --- | --- |
| H1 Correct red | All independent defect logs reach named assertions and record actual states. Wrong-Node ABI aborts and one early diagnostic-fixture gap are retained as nonproofs. Mutation logs retain named first assertion, patch, and restoration hashes. |
| H2 Binding seam | Defect tests use real metadata CAS and file owners; gates delay calls, not owner answers. Future binding is verified against real subsequent SELECTED. Driver scripted answers are confined to route mapping tests and backed by real integration refusals. |
| H3 Time/order | Component time is virtual; pump rounds 200 formation/120 settle are fixture ceilings, not production milliseconds. Race witnesses use explicit gates and immediate turns. Same-row timestamps legitimately tie to test both lexical orders. |
| H4 Fields | Real serializer, manager-captured intent/admission, immutable binding/token/opening/storage, actual boot incarnation and exact metadata rows are used. Copied-file identity failure is an actual inode replacement. |
| H5 Nonvacuity | Reservation blocker is asserted ADMITTED before release; actual delayed request later ADMITTED. Custody tests actually acquire successor owner. F3 measures two entries while first pending. F5/F6 really select J after every I resource closes. |
| H6 Live ceiling | Native application group only; real physical and SQLite owner observations, not production replicated metadata, child death, live lab, or deployed activation. Lab/certification must establish those separate claims. |

### Owner interaction

| Item | Evidence and assessment |
| --- | --- |
| O1 Semantic owner | Inspection versus opening distinction holds; copied reservation finality fails F1; historical completion split fails F5. |
| O2 Typed boundary | Inspection adapter chain has typed UNSUPPORTED; shared confirmer keeps closed refusal vocabulary. Finality and lifetime require the explicit contracts identified in F1–F6. |
| O3 Paired invariant | Same witnesses show journal custody versus authoritative slot (F1), process ownership versus durable effects (F4), and predecessor completion versus successor progress (F5/F6). No separate-green substitution. |
| O4 Stale then fresh | F1 releases original after blocker closes/selection becomes true; F2 resumes stale scan after newer ACTIVE; F5/F6 advance real instance authority before old replay. |
| O5 Pressure/backoff | Normal pending-wake coalescing and unavailable-grant suppression are covered; F3 redrive bypasses existing serialization and F2 repeats startup work. |
| O6 Wake/release | Token-bearing native/genesis/CLOSED wake goes through canonical handler queue; P-R5 verifies CLOSED wake RECORDED without fabricated REMOVE. F6 prevents progress before a wake can rescue it. |
| O7 Projection authority | Services/endpoint rows are not serving authority; exact binding/token confirm remains. F5 proves a disagreement between physical/history result and projection/journal discharge, rather than promoting a cache to authority. |
| O8 Treatment fidelity | Independently authored mutation patches are stored; every production file is restored by exact bytes and full source SHA256 manifest is compared after each mutation. Base comparison replaces the complete changed production surface and restores it. |
| O9 Escape hatch search | Six raw censuses cover raw path readers, scans, row completion, start outcomes, wakes, and retirement/lifetime callbacks. F1's copied refusal set and F3's alternate map registration are the identified bypasses. No unit-2 local grant fallback was added. |
| O10 Registry alignment | All31 src/test paths reviewed with same-quest registry changes. Impact contract audit passes. Full classification census matches; the absent external MovieLens data initially changed 19 observation entries. After the repository-pinned real dataset was provisioned and independently hash-checked, both `static-final/shards.log` and `static-final/fast-static.log` pass without regenerating classification metadata. |

### Formation circularity

| Item | Evidence and assessment |
| --- | --- |
| Fm1 Dependency inventory | Journal, resource authority and runtime-policy reads occur before local application-group opening; services/endpoints project after serving authority. Bound class excludes built-in meta services/Cells. No new self-managed metadata ledger is introduced. |
| Fm2 Starvation | Inventory is journal rediscovery independent of native wake delivery; direct reentry is retained. Owner unavailability does not create a serving bypass. Quiet-group production release/B9 and offline grant cadence are deferred scopes. |
| Fm3 Formation clients | Handler's pre-ready messages return NOT_READY/deferRetry with no outcome; P-R11 and explicit route test. Public CREATE TABLE/production formation not claimed by this unit. |
| Fm4 Window arithmetic | Local tests use declared virtual/pump bounds; no valid conversion to live client latency. Production formation-window margin requires pending certification formations; cannot be approved from these fixtures. |
| Fm5 Consistency bypass | Metadata/journal act through registered owners; local inventory is read-only. No raw write shortcut or alternate local permission is introduced. F1/F5 are semantic interpretation defects, not grounds for bypass. |

### Sweep / timer

| Item | Evidence and assessment |
| --- | --- |
| S1 Clock | No periodic sweep timer is added. Immediate scheduling is a one-shot queue handoff; timestamps use existing sources. There is no new interval requiring clock injection or unref. |
| S2 Role/authority | No rollback/log-index decision is added. Per-node inventory plus existing authority and exact-token local owners gate effects; P-R13/P-R15 cover node/process identity, with F2/F4 lifetime failures. |
| S3 Crash equivalence | restartHost rebuilds handler, manager, runtime, driver and lifecycle over same directory, releases/reacquires real process owner, and advances boot incarnation. It does not simulate SIGKILL; F2/F4 expose surviving asynchronous state across nominal shutdown. |
| S4 Detection windows | No elapsed-time failure detector or enlarged hold threshold is added. Fixture settle bounds diagnose stalled behavior but do not certify production timeouts. |
| S5 Sweep starvation | Startup scan's metadata/journal availability is an explicit prerequisite; failures leave ready closed. No independent timer loop heals unavailable authority. Production startup retries are activation scope. |
