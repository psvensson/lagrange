---
documentClass: planning
---

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

## Coverage model and implementation choices

The table records actual reachable combinations instead of claiming an exhaustive Cartesian product over impossible states. For example, a PENDING row has no admission token and therefore does not undergo the admitted local-record reader until the canonical reentry resolves that same request. A TERMINAL row is excluded from startup enumeration but remains meaningful to a live memo's REMOVE.

| Journal entry / owner condition | Local evidence | Initial memo and continuation | Observable outcome and later REMOVE | Evidence / assessment |
| --- | --- | --- | --- | --- |
| PENDING, reservation never applied yet | Not inspected; no token | HELD, REENTER(original creation id) | Canonical reserve resolves exact retained request; REMOVE must first resolve it | P-R12; service R5-A. Applied/sealed/unavailable cases pass; F1 refutes false sealing of temporary refusals. |
| PENDING, reserve applied and reply lost | Not inspected during scan | HELD, REENTER; REMOVE can first promote retained token | Real token survives and retires, then row COMPLETED | P-R12 and P-R12c. M10 forbids skipping resolution. |
| PENDING, immutable competing winner | No locally admitted token for this row | HELD until canonical path determines sealed refusal | CANCELLED; same live-memo REMOVE completes; cancelled row absent after restart | P-R12 and route R2-A/R3-E. No inference from temporary occupancy is accepted. |
| PENDING, authority unavailable | Unknown | HELD then named retryable failure; row stays PENDING | REMOVE_HELD, no row cancellation | P-R12; route R2-A/R3-E. |
| IN_PROGRESS with admission, no opening claim | Missing file or zero tables | ABSENT_UNCLAIMED; HELD then REENTER | FRESH opening through the original owner; held founder, then bound REMOVE completes | P-R1 and N13. No by-path read creates a file. |
| IN_PROGRESS with opening claim | Missing file or zero tables | ABSENT_CLAIMED; HELD then REENTER | Permanent CREATION_STORAGE_MISSING, no new file; typed absence still permits bound retirement/CLOSED | P-R1b, P-R9, N13; M06 rejects a fabricated tombstone. |
| IN_PROGRESS, no opening claim | File has application tables | CONTENT_CONFLICT; HELD then canonical reentry refusal | Permanent failure, no inferred fresh/open permission | N13's actual file case; same CONTENT_CONFLICT refusal class as P-R9/route R1-B. No end-to-end host test of this syntactically valid but forbidden combination is claimed. |
| IN_PROGRESS, exact admitted identity | ADMITTED local, ADMITTED/PUBLISHED authority | HELD then REENTER | New host stays HELD until actual grant path; published authority allows idempotent regrant and ACTIVE | P-R4; original native publication integration; M02 pins identity. |
| IN_PROGRESS, exact published identity | PUBLISHED local, PUBLISHED authority | HELD then REENTER | Retained opening; actual serving confirmation and projection under current boot; explicit CREATE redispatch may be required in unit 1 | P-R7 crash 1, with its documented unit-2 wake ceiling. |
| IN_PROGRESS, local published but resource releasing/closed | PUBLISHED | HELD then REENTER | Permanent RESOURCE_CLOSED, no reopened replica; subsequent bound REMOVE tombstones and completes | P-R6. |
| IN_PROGRESS, same identity retired | RETIRED; metadata RELEASING or CLOSED | REMOVING then REDRIVE under creation identity | Bound close, STOPPED projection, row completion; no invented coordinator outcome | P-R5 and P-R7 crash 3–5; M05/M09. Single-row result passes; F3/F5/F6 reject omitted concurrent/historical cases. |
| IN_PROGRESS, malformed local record | CORRUPT_STATE | HELD then canonical reentry | Permanent CREATE_FAILED; REMOVE_FAILED, no CLOSED | P-R9; M12 and its independent direct control. |
| IN_PROGRESS, copied file / wrong immutable identity | CONTENT_CONFLICT | HELD then canonical reentry | Permanent CREATE_FAILED; REMOVE_FAILED; original PUBLISHED record remains untombstoned | P-R9; N13; M07. |
| Valid admitted row, adapter lacks inspection verb | UNSUPPORTED | HELD then REENTER | Inventory records UNSUPPORTED without forcing a physical refusal; the scripted runtime then legitimately answers HELD through canonical reentry | Base adapter tests and route R1-H/R2-F scripted-runtime inventory. Not a claim that a native WASM lifecycle lacks its own reader. |
| Malformed journal without recoverable identity | CORRUPT_STATE, reentry false | No fabricated memo/operation | Row-local named inventory failure; later good row still returned | Service R2-E; no unbounded retry loop. |
| Corrupt admitted row retaining routable identity | Typed inventory failure with reentry true | HELD under retained identity | Existing canonical refusal path decides failure | Source row decoder/reentry policy and route mapping; no independent host corruption permutation beyond the measured cases is claimed. |
| Foreign-node row | Reader not called for that row | No local memo, no continuation | No local outcome or filesystem touch | P-R13; M08. |
| Generic service operation row | Existing generic resolver returns null | Left to existing generic recovery / activation | No bound-creation memo or authority mutation | `recoverPendingOperations` census; handler supplies null resolver. |
| COMPLETED or CANCELLED row with a live memo | Not startup-enumerated | CREATE reentry yields permanent TERMINAL; existing memo links exact creation | REMOVE_COMPLETED; after restart no memo means honest NOT_FOUND | P-R8; service R3-D; route R3-D; no synthetic coordinator request. |
| FAILED terminal row | Not startup-enumerated | Terminal state preserved | REMOVE_FAILED, unlike completed/cancelled | Route R3-D and service row-state test. |
| Multiple valid rows sharing canonical replica | Mixed RETIRED/REENTER or two ABSENT/REENTER | Must preserve both exact obligations | Current last memo write loses the successor or repeats predecessor forever | F5/F6, both actual orderings and two local classes. |
| Ready/shutdown/concurrent scan boundaries | Same journal and file | Must own one scan and preserve lifetime | Current code writes/enqueues after stop or clobbers newer ACTIVE | F2; normal pre-ready response and ordinary REMOVE preemption still pass P-R11/P-R14. |

### Five retirement crash boundaries

All five design boundaries have an actual host-reconstruction witness. These are labelled one-call failures, not abrupt process deaths.

| Crash boundary | Durable state asserted before reconstruction | Required reconstruction | Actual coverage |
| --- | --- | --- | --- |
| 1. Endpoint removed, before physical fence | Endpoint absent; resource/local still PUBLISHED | Retained reopening and projection under new host, then repeat REMOVE | P-R7 first block; explicit CREATE redispatch is honestly present if unit-1 wake does not confirm. |
| 2. Fence and RELEASING, before tombstone | Resource RELEASING, local PUBLISHED | No serving reopen; explicit REMOVE produces exact tombstone and CLOSED | P-R6, referenced by P-R7. |
| 3. Tombstone durable, before CLOSED | Local RETIRED; resource RELEASING; journal IN_PROGRESS | Silent RETIRED redrive closes before deleting services projection | P-R5 and P-R7 tombstone block. |
| 4. CLOSED applied, before STOPPED | Resource CLOSED; local RETIRED; services still present; journal IN_PROGRESS | Redrive projects STOPPED without a second CLOSED mutation | P-R7 close-reply-lost block. |
| 5. STOPPED applied, before creation row completion | Resource CLOSED, local RETIRED, services/endpoint gone; journal IN_PROGRESS | Redrive completes journal without reopening | P-R7 stopped block for still-retained authority; F5 extends it through real successor selection and finds the historical gap. |

### Judgement of the implementer's named choices

| Choice | Independent assessment |
| --- | --- |
| `awaitsRestartInventory` opt-in | Appropriate for this bounded unit while production activation has no inventory caller. Making it unconditional would gate existing production forever. The opt-in does not excuse missing one-shot/STOPPED ownership (F2). |
| Generic rows untouched by bound inventory | Consistent with the stated unit boundary. No generic recovery semantics were changed by the null resolver. Activation still must run the generic path where required. |
| HELD before ready for typed local refusal, canonical reentry writes FAILED | Preserves one canonical permission/refusal decision site in the single-creation case. Inventory itself never promotes local evidence to serving authority. Multi-creation custody still fails F6. |
| “Start only while the memo is HELD and names the creation” | Correctly protects the measured ordinary REMOVE preemption, but is not a complete custody implementation. It silently drops valid work when another creation legitimately shares the canonical replica, and does not stop dead-handler work. F2/F6 reject this choice as a general proof. |
| Compare present storage identity for by-path tombstone | Required to prevent copied-file retirement; demonstrated with real copied inode and exact local identity. Missing storage remains typed absence and does not synthesize a tombstone. |
| Keep REMOVE completed after CLOSED when row completion fails | Physically honest only while the row retains a reachable recovery obligation. P-R7 proves the same-instance retry; F5 disproves complete discharge after history advances. The row-completion failure cannot simply be ignored. |
| Pass manager `phase: UNAVAILABLE` through to the opening module | In scope and correctly leaves physical permission with the opening owner. That function's 1,319 bytes are byte-identical to base; wake and reconciliation source files are also unchanged. `census/unit2-exclusion.json` records their SHA256 values. |
| Shared start-result confirmer at runtime and manager | The closed permanent vocabulary and named UNKNOWN/UNAVAILABLE pass-through survive double confirmation. M13 proves an arbitrary lifecycle code must remain a deferral. |
| Six superseded witnesses | All six old assertion blocks remain verbatim comments at their cited locations; successors cite R5-A, R1-D or R2-A. Three are in `service-consensus-creation-intent.test.js` at 124,262,288; two route blocks at 668,835; publication at 440. The driver interface allowlist addition and typed-lifecycle sibling are additional changes, not hidden deletion of an old assertion. |
| Implementer's direct `node --test` run | It bypassed the required runner and is not used as evidence here. This verifier reran every required file through the classified runner and retained thermal-gate output; the historical deviation remains explicitly documented. |

## Independent measurements

### Runner, source identity and prerequisites

All accepted dynamic results use the repository's classified single-file runner, one file at a time, with its thermal check enabled. On this container the thermal check reports `unmeasurable (no sensors)`; I did not replace or bypass it. The runtime is Node 22.16.0 with native ABI 127 and the locked shared dependency installation. The native SQLite binding was rebuilt by the root agent for that runtime. No production/lab host was used for this review.

The first attempts used an incorrectly resolved Node 24 binary and aborted on the native ABI prerequisite. Those logs remain under `runs/` and `.wrong-node24` suffixes and are **not zero-test passes or source failures**. A preliminary future-binding fixture diagnostic is retained as `.diagnostic-fixture-gap`; only the corrected real-owner execution is used for F1. I did not hide these attempts or substitute them for measured assertions.

Node's Git subprocess is blocked by the default sandbox even when the Git subprocess's output/status are present. The first default fast-static therefore incorrectly discovered zero changed paths. That result is not a scoped proof. The same read-only audit was rerun through the explicit approved execution boundary; it discovered all 152 changed paths (26 JavaScript) and eventually passed with the actual required dataset. No check was disabled. The proof's implementation diff remains exactly the 31 `src/`/`test/` paths.

### Original required suites

`runs-node22/results.json` records commands/exits/durations; `test-counts.json` derives semantic Node TAP counts from the preserved individual `.tap` files. All ten files have zero cancelled/skipped/todo tests. The aggregate is **240 tests: 233 pass, seven fail**.

| Classified file | Tests / pass / fail | Classification |
| --- | ---: | --- |
| `test/wasm-service/bound-creation-restart.integration.test.js` | 15 / 15 / 0 | New unit-1 host restart surface. |
| `test/node/runtime-service-bound-route.test.js` | 43 / 43 / 0 | Changed route and stage-1c U/N/H mappings. |
| `test/service/service-consensus-creation-intent.test.js` | 29 / 29 / 0 | Journal inventory/resolution/completion. |
| `test/wasm-service/wasm-creation-local-record.test.js` | 10 / 10 / 0 | Read-only local inventory and seven-field identity. |
| `test/service/service-type-adapter.test.js` | 5 / 5 / 0 | Base typed adapter surface. |
| `test/wasm-service/wasm-service-lifecycle.test.js` | 51 / 51 / 0 | Changed lifecycle result mapping and existing lifecycle behavior. |
| `test/wasm-service/wasm-creation-publication.integration.test.js` | 23 / 23 / 0 | Stage-1c publication and retained retirement regression. |
| `test/runtime/wasm-driver-contract-conformance.test.js` | 30 / 23 / 7 | Same exact seven failures as the full changed-production base comparison. |
| `test/wasm-service/bound-creation-handler-embedding.integration.test.js` | 2 / 2 / 0 | Existing host embedding regression. |
| `test/node/runtime-service-handler.test.js` | 32 / 32 / 0 | Existing handler regression. |

The driver failures are prepare READY, start RUNNING, health, prepare idempotence, start idempotence, valid descriptor preparation, and prepared-service start. To classify them, I restored all 17 changed production files to base (removed the new inventory module) and restored the base conformance test, ran the same classified file, and restored candidate bytes in a `finally` block. Base and candidate each have 30/23/7 and the same exact failure names: `base-comparison/failure-signature.json`, both raw TAP logs, and `base-comparison/results.json`. This is an inherited failure signature, not a green suite and not an unexplained candidate regression.

### New independent witnesses

Fifteen independent test cases were added as append-only test snippets in the verifier worktree. Their constituent classified runs yielded **ten negative counterexamples and five positive controls** on the candidate. The negatives cover F1 three ways, F2 two ways, F3, F4, two predecessor/successor orderings exposing F5/F6, and the older-REENTER successor-first case. The positive controls are journal-only inventory, the older-REENTER predecessor-first ordering, and the three direct mutation controls.

The complete append-only patch is `independent/independent-witnesses-complete.patch` (SHA256 `51dafdbdb8c8b5438d3ca679e014a3038160c09f92a339040b4206ef3890367e`). Complete resulting test-file copies are beside it with suffix `.independent-complete`. All constituent snippets were measured, but this combined convenience patch was not rerun as one combined suite; `final-restoration.json` states that distinction. Corrections may require the lead to adapt witness setup to a new explicit owner contract; the faulty original subject must continue to fail the same semantic assertions.

## Mutation proof

Each mutation was authored independently from its mechanism. No implementer patch was reused. Only the named source change plus, for M01, a green independent positive control was present; the known-red defect tests were absent. Every source mutation and test append was restored in `finally`. Full production SHA256 maps match before/after and after each case (`mutations/source-before.json`, `source-after.json`, `results.json`). All thirteen mutations were killed.

The table gives the original first failing assertion line in the preserved runner log. M02/M05/M12 originally failed bounded convergence after their branch was engaged; additional independently authored direct assertions have a green 18/18 baseline and also fail under the same mutations. Those direct logs remove reliance on an eventual timeout as the only kill evidence.

| Mutation | First failing witness / assertion | Evidence |
| --- | --- | --- |
| M01 Inventory reads resource authority | Independent inventory-only control: `INVENTORY_CROSSED_JOURNAL_ONLY_AUTHORITY_BOUNDARY`, reads 1 instead of 0 | `mutations/M01-inventory-reads-resource-authority.runner.log:225` |
| M02 Reentry uses a scan id | P-R1 cannot settle original creation; direct control sees no invocation under retained id | Original log `:21`; `mutations-direct/M02.runner.log:285`, `RESTART_USED_AN_ID_OTHER_THAN_RETAINED_CREATION` |
| M03 Memo written after reentry | P-R1 memo-before-ready assertion sees undefined instead of HELD/original id | `mutations/M03-memo-after-reentry.runner.log:21` |
| M04 Row completed at PUBLISHED | Publication P1 expects IN_PROGRESS, gets COMPLETED | `mutations/M04-row-completed-at-published.runner.log:42` |
| M05 CLOSED redrive skipped | P-R5 redrive cannot settle; direct control records zero bound stops for actual RETIRED plan | Original log `:42`; `mutations-direct/M05.runner.log:175`, `RETIRED_PLAN_NEVER_ENTERED_CANONICAL_STOP` |
| M06 Missing storage called a tombstone | Local tombstone witness gets RETIRED instead of CREATION_STORAGE_MISSING | `mutations/M06-tombstone-inferred-from-storage-missing.runner.log:64` |
| M07 Five-field local identity | Retained reopen no longer throws `FILE_IDENTITY_CHANGE_REOPENED` for changed immutable file identity | `mutations/M07-five-field-local-identity.runner.log:52`; N13 also fails |
| M08 Node filter removed | P-R4 inventory includes a foreign operation/INVALID_LINEAGE plan; P-R13 also fails | `mutations/M08-foreign-node-filter-removed.runner.log:35` |
| M09 Redrive emits a REMOVE outcome | P-R5 sees a real correctly shaped fabricated executor outcome | `mutations/M09-redrive-emits-remove-outcome.runner.log:42`, `THE_RESTART_REDRIVE_EMITTED_AN_OUTCOME` |
| M10 PENDING terminated without resolution | Route cell (c) resolver invocation count 0 rather than 1 | `mutations/M10-pending-terminal-without-resolution.runner.log:238` |
| M11 UNAVAILABLE grant sets pending wake | R4-A/R5-A observes pending true rather than false | `mutations/M11-unavailable-grant-wake-pending.runner.log:295` |
| M12 CORRUPT retirement left redrivable | P-R9 cannot get required permanent REMOVE_FAILED; direct control gets REMOVE_HELD/CORRUPT instead | Original log `:70`; `mutations-direct/M12.runner.log:169`, `CORRUPT_LOCAL_RECORD_WAS_LEFT_REDRIVABLE` |
| M13 Arbitrary lifecycle code becomes permanent | REPLICA_LIVE loses named transient deferral and gains wrong permanent code | `mutations/M13-arbitrary-lifecycle-code-permanent.runner.log:301` |

Every row has its exact `.patch`, `.tap`, `.tap.stderr` and `.runner.log` beside the cited file. `mutations/summary.json` records full first-failure excerpts; `mutations-direct/M02.direct-summary.json` and siblings bind direct failure lines, baseline counts and mutant counts.

## Static measurements

All final static measurements are on restored candidate source and test bytes, with no independent witness appended. No baseline file or threshold was changed.

| Check | Measured result | Evidence |
| --- | --- | --- |
| Fast-static, explicit base `381750de2` | PASS, 152 paths / 26 JS, every member green; 27.199 s wrapper duration | `static-final/fast-static.log`, `results.json` |
| Decision boundaries, per changed source file | All 17 files individually scanned, zero new violations | `static-node22/decision-01.log` through `decision-17.log`; exact file mapping in `results.json` |
| ESLint | PASS on all 26 changed JS files | `static-node22/eslint.log`, `results.json` |
| Scoped complexity | Six threshold violations, all same function/magnitude as base; command exit 0 | `static-node22/complexity.log`, `complexity-scoped.json`; `base-comparison/complexity.log` |
| Scoped cognitive complexity | Zero violations in 17 targets, threshold 20 | `static-node22/cognitive.log`, `cognitive-complexity-scoped.json` |
| Scoped literals | Zero new, zero raw, zero inherited in 17 files | `static-node22/literals.log` |
| Scoped silent catch | Zero new; one raw/inherited occurrence in 17 files | `static-node22/silent-catch.log` |
| Curated/primary/resource/subsystem classification | PASS, 2410 files; primary unit 2093/integration 105/bootstrap 205/convergence-probe 3/packaging 4; resource digest `fnv1a32-a7b2ca03`; subsystem 22, digest `fnv1a32-746dd8da` | `static-final/shards.log` |
| Impact contracts | PASS | `static-node22/impact-contracts.log` and final fast-static member |
| Duplication | Source/scripts 47 groups / 1462 lines at gate 47/1462; test 698 / 26458, exactly the brief's inherited observation, above configured gate 697/26369 | `static-prereq-reruns/duplication.log`, `jscpd-src-scripts.json`, `jscpd-test.json` |
| Unused exports | 1456, exactly the brief's inherited observation, above configured gate 1416 | `static-node22/unused.log` |
| Import seal | Source and producer-input digests match committed seal; two local refreshes deterministically agree on a different resolver/snapshot digest. **Exact committed seal bytes were not reproduced.** | `static/seal-refresh.log`, `static-prereq-reruns/seal-refresh.log`, committed/local seal JSON and `seal-comparison.json` |

The six inherited complexity functions are `RuntimeServiceHandler.handleRemoveReplica` 14, lifecycle operations `prepare` 16 / `start` 26 / `stop` 14, manager `_buildLifecycleLogContext` 16, and `recoverOperationRow` 31 (threshold 12). No magnitude increased in the full source-base comparison.

The duplication command first exhausted the default roughly 2 GiB heap (exit 134). Its approved resource rerun with a 6144 MiB heap completed and reported the actual ratchet result above. The OOM is preserved as a prerequisite failure, not a zero-debt or source-failure classification.

The initial subsystem audit failure was traced to exactly 19 observation entries differing only because `data/examples/movielens-100k/u.data` was absent; all 2410 primary/subsystem assignments and digests already matched. The root agent obtained the actual repository-pinned dataset, and I independently checked 1,979,173 bytes and SHA256 `06416e597f82b7342361e41163890c81036900f418ad91315590814211dca490`. The honest dataset resolved both audits without changing any classification metadata. See `static-prereq-reruns/subsystem-observation-drift.json` and `static-final/dataset-prerequisite.json`.

Seal details: committed and local `sourceDigest` are `f31befc1f67cc91671c12e2d96f49c459578ea8c964104e251b7dedd256f16f2`; both producer digests are `9c49e58b776c3fa59a8855843ad811b1ded3a6acbf86a11683496a768c28684b`. Committed resolver digest is `1e2af453997c2ae7ed29a245f259e28fa4a1077d767a03190a4aef1dcb1f0476`, local is `55c80b979cd86fc84102e3d6859b2c60c5e4fdaf7ef2540e1d096d4758809c36`. The resolver hashes installed resolution surfaces; matching source/producer bytes establishes no source divergence, but does not prove the old dependency surface. This variance is a stated evidence ceiling; the committed seal was restored, not silently replaced.

## Lab and remaining proof ceiling

No lab job was submitted, reconciled, cancelled or inspected by this verifier. The user handover identifies unit-1 jobs #183 and #184, covering the 38-file cone saved at `solve/quests/wasm-creation-genesis/evidence/recovery-20261017/unit1/lab-selection-recovery-u1.txt`. The root agent owns current queue/result classification. I do not turn a relayed “unblocked” message into a measured job result or claim the historical payload commit is this exact review hash.

Before accepting those jobs, classification must match their actual payload/source tree to the reviewed unit-1 source; verify all selected files ran, distinguish semantic test count from TAP suite count, and inspect every failure/timeout/UNCERTAIN. The known seven driver failures require exact base-signature comparison, not a blanket suite allowance. Native/network/process prerequisites and skipped tests cannot count as a source pass. Any F1–F6 correction requires fresh proof for its changed owner cone; green jobs of the old candidate would not refute these measured counterexamples.

Actual child-process crash/P-R10, uncheckpointed WAL survival, in-flight native Ready recovery, offline local-grant restart admission, Kth stable-cycle cadence, production activation, multi-process formation windows and deployment certification remain outside unit 1. Unit 2 must prove its own frozen claim. Lab pending is an explicit ceiling, not by itself the reason for this implementation rejection.

## Reading, census and restoration limits

I read the governing instructions, all nine applicable templates, the complete saved verifier brief, the design through Revision 5, all six historical independent design vets, CONTRACT-R2/HANDOFF and RV5–RV7 custody, the implementer report and its supersession claims, and the complete implementation diff. All 31 changed `src/`/`test/` paths were inventoried; no changed path/hunk was withheld from review. Relevant surrounding owners, transport/wake paths, process ownership and fixture seams were followed through the raw censuses named above. I did not rely on the implementer's mutation patches as independent evidence.

The corpus contains 5,220 tracked files under `src/` and `test/`; the remaining 5,189 files were **not subjected to a complete-file exhaustive review**. Some were read at relevant owner boundaries/call sites, as documented in the census. Ten of 2,410 registered test files were run locally in original form; the remaining 2,400 were not locally executed by this verifier. The independently appended witnesses and mutation reruns are additional executions of already classified files, not extra registered files. I did not read every historical raw implementer log or rerun the whole 38-file lab cone; the accepted local measurements are explicitly enumerated above.

The final tracked working tree is clean at `a251ce4fd9c980a78c0fd33d8a5f873161f90870`. Production and test bytes were restored; `final-source-test-sha256.json` covers all 5,220 tracked source/test files and `final-restoration.json` records empty tracked status and patch identity. Dependencies and the actual dataset are untracked prerequisites, not source changes. No commit, ref, root/other worktree, quest log, historical evidence, or external communication was modified by this verifier. The lead receives this evidence for its own append-only quest record and corrective review.

**Final verdict: REJECT recovery unit 1 at a251ce4fd.** Six complete interaction classes require correction and independent reverification. The measured static success, inherited-debt classifications and thirteen mutation kills are useful positive evidence; they do not override ten real counterexamples. This report approves neither a repair design nor unit 2, activation, certification or merge.
