# Independent CDC transfer-owner source review — round 1

Date: 2026-10-12 (Europe/Stockholm). Reviewer:
`subagent:/root/review_checkpoint_composition`; author distinct.
Review mode: bounded source review, no product mutation.

## Verdict and exact scope

**REJECT this transfer-owner source slice pending PO-1, PO-2 and PO-3 below.**
PO-4 is a separate, lower-severity diagnostic correctness defect. The complete
63-item pass is below; these are four grouped findings, reported together.

The existing focused file independently passes **64 assertions**. The added
independent diagnostic has three positive controls and seven counterexample
observations, grouped into those four findings. It imports the real owner;
no pool model, source replacement, cluster or transport bypass is involved.

This is not a rejection of the approved D24 design. Design
`b4b0294f4e91f09773f708e5e006c936c9617129e550dcfa2707032d07c76269`
and the nonblocking hash erratum resulting in
`cfe7405ce63469383c879c7dd3de6406b255468cd3e6816fbdbb5c219019eb84`
remain approved at the prior scope. Prior review
`f68026470d22e3d3762cdf8c884c638553bb2b3943d6030fd02b0d21e8c97c1d`
is unchanged. Caller source
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains closed; the actual
reconcile-owner bytes were compared with that snapshot and match.

Only these two files are the source subject:

| File under C | Exact SHA-256 |
| --- | --- |
| `src/cdc/cdc-coverage-transfer-owner.js` | `bde0b33492c7843475e39c26885c25ab00f4afb4bd7569aee7c6b702dcddd0d5` |
| `test/cdc/cdc-coverage-lifecycle-owner.test.js` | `9912fb688f9f27d5272df713e8627a201bbf954078fcf69157f43435790d54b3` |

Both match live bytes and Git objects in preservation snapshot
`c8800cd70d315b27034506d5632c6d554fabbb80`. The working tree HEAD remains
`e7c89f4b5114c0238312d3831b65889a4622f4e9`; it alone does not identify
the reviewed WIP. No acceptance is conferred on other files in the snapshot.

Author report:
`a5987c467ea54d6b7efc5c165ab6991f9a8c6a631aadc29775d784b197f58136`.
Author six-entry packet manifest:
`c066b93add5c7212c0fce6d7faf1c4ded9ed1fdc1d2c1cadf07cce3f65d76bf1`.
All six entries were independently checked.

## Evidence map

All short references below resolve to concrete files:

- **C** = `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.
- **D** = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/cdc-transfer-owner-source-round1-independent`.
- **PO** = C/`src/cdc/cdc-coverage-transfer-owner.js`.
- **LT** = C/`test/cdc/cdc-coverage-lifecycle-owner.test.js`.
- **RO** = C/`src/cdc/cdc-coverage-reconcile-owner.js`.
- **LO** = C/`src/cdc/cdc-coverage-lifecycle-owner.js`.
- **DESIGN** = C/`solve/quests/replicated-transaction-decision-and-apply/cdc-coverage-response-resource-handoff-amendment-20261011.md`.
- **P** = D/`owner-counterexamples.mjs`, results D/`counterexamples.json`,
  raw output D/`counterexamples.txt`.
- **B** = D/`descriptor-boundaries.mjs`, results D/`descriptor-boundaries.json`.
- **NATIVE** = C/`solve/quests/replicated-transaction-decision-and-apply/evidence/cdc-native-profile-prerequisite-20261011T2223`.
- **AUTHOR** = C/`solve/quests/replicated-transaction-decision-and-apply/evidence/cdc-transfer-owner-implementation-20261011T2236/implementation-report.md`.

D/`source-ledger.json` binds preserved copies of the relevant source and
impact contract. D/`git-object-checks.json` binds the exact snapshot comparisons.
D/`commands-and-results.md` records commands, exits, test limits, the corrected
initial native-check path error and which native evidence was not rerun.

Exact independent evidence hashes:

| Artifact under D | SHA-256 |
| --- | --- |
| `manifest.sha256` (19 diagnostic/navigation files) | `a9f58b8ce42136dd8bde3f171e1165058e7dcf3cae279d43e368c582d3f4189c` |
| `focused-test.txt` | `a1a809c8bd51ede10c5ba5e4c0c1d47c8f8ebd5e7bce0034d282eff6ec731700` |
| `counterexamples.txt` | `4cb23b90c635636f37a188f6344f48cde94cc17bfae96c02a0004eff0f4376fd` |
| `counterexamples.json` | `503be373e2d27ca8f465a03a73ae989d0242f469309c9dc182e7499b71bcb916` |
| `native-identity-checks.json` | `57bbb3397b38427ebe5423719f19984281cbe040cd408980802e4611a152a442` |
| `signature-check.txt` | `14175ec056e65c44e69a6b44cd7063644e8a7dbdb91cca1f345d1a463b5248de` |

## Complete findings

### PO-1 — descriptor validation and retained custody consume different values

**Blocking: capture/validation, scalar ownership and exception atomicity.**
PO:99–138 validates by repeated field reads, then PO:327 invokes the
MessageRouter callback before PO:341 rereads the original descriptor into the
standing pool. The supposedly fixed scalar descriptor is therefore not the
validated descriptor.

A plain own-data object suffices: provide valid occupancy fields; inside the
supported terminalize callback change `immediateBytes` to an object containing
a 1 MiB Buffer; return the exact supplied terminal result. Transfer returns
true. The pool now retains that same object while reporting only 16,384 bytes.
After endpoint retirement and two GC turns, the graph is still alive. The
normal control's service and shutdown record are collected under the same
schedule. The new permanent root is:
`nodePools -> pool.terminalDescriptor.immediateBytes -> graph.buffer`.
No prototype patch or hostile intrinsic is needed.

A second manifestation shows partial-state damage: an accessor returns 4096
during validation; the callback sets it to throw on the final copy.
PO:339–340 have already terminalized the internal state and removed its
shutdown record, but PO:342–349 have not cleared the active claim or returned
Wlistener. The throw escapes. The valid retry returns false; retirement
returns true; a fresh endpoint for the same node still cannot reserve a
successor. All 16,777,216 bytes remain charged with no reachable successful
completion path through the exported operations.

Evidence:

- P:81, `descriptor-mutates-between-validation-and-custody`:
  true result, object stored by identity, 1,048,576 retained payload bytes
  against 16,384 charged bytes.
- P:102–119: normal service/record collection passes; mutated graph survives.
- P:122, `final-copy-throw-strands-listener`: thrown final-copy error,
  active charge 16 MiB, retry false, retirement true, successor false.
- B: inherited descriptor with **zero own fields** is accepted.
  Ordinary NaN/infinity/negative/unsafe/boxed/string values are refused,
  demonstrating that the failure is consumption after validation, not a
  universally absent numeric check.
- LT:174 and LT:280 exercise static POJOs only; an extra discarded property
  does not prove that the selected fields stay scalar.

Required correction stays inside this owner: obtain the canonical bounded
scalar descriptor once, before the callback and before irreversible state
changes, and retain that captured descriptor. Enforce the declared own-data
boundary rather than re-reading accessors/inherited evidence. A capture
failure must leave the original claim retryable, without a partially
terminalized active claim. The valid control and both negative schedules
must run on the same correction. No new descriptor store or validator owner
is needed.

### PO-2 — retirement can destroy an in-progress claim's only completion owner

**Blocking: reentrancy, ownership transfer and recovery.**
PO:323 sets `TRANSFERRING` before calling the terminal mutation. Retirement
PO:421–424 refuses only `ACTIVE`; it permits retirement during that callback,
deletes `owners[service]`, and removes the endpoint from the pool.

When the callback then throws or returns a different result, PO:328–336
restores `ACTIVE` and its release capability on the old state. It does not
restore a reachable owner. A retry cannot find that owner; a new endpoint
finds the old pool's still-active claim and refuses. This is not the deliberate
temporary HOLD asserted by the author: the obligation cannot complete through
the API even after valid current evidence is supplied.

Both modes independently reproduce through public operations at P:148:

| Observation | Throw after retirement | Wrong result after retirement |
| --- | ---: | ---: |
| retirement inside callback | true | true |
| original transfer result | false | false |
| valid exact retry | false | false |
| fresh same-node successor | refused | refused |
| retained bytes | 16,777,216 | 16,777,216 |

The simpler failed-callback control P:43 passes when retirement does not
interleave. LT:155 and LT:314 check retirement only in ACTIVE, leaving the
TRANSFERRING interval untested.

Required correction: keep the same canonical owner and release capability
reachable throughout every nonterminal handoff state; retirement and callback
failure must obey that same state machine. Any post-callback revalidation
must preserve a truthful owned HOLD, not resurrect an unreachable ACTIVE
state. Include both failed-callback modes and a successful successor control.
No runtime barrier or alternate completion path is required.

### PO-3 — one throwing wake aborts later wakes after the transfer is final

**Blocking for the new handoff's release/progress contract.**
PO:354 invokes the snapshot of registered callbacks without isolating an
individual failure. The byte return, tombstone and release count have already
committed. With two registered wakes, the first throwing causes the transfer
API to throw; the second never runs. Retrying the old claim returns false,
so it cannot finish the interrupted notification pass.

P:165, `wake-error-after-irreversible-transfer`, records:
`retainedBytes=16384`, `releases=1`, `listenerActive=false`,
`laterWakeCount=0`, error `wake failure`, retry false.

This is the new listener path's use of a pre-existing callback pattern:
row-session release at PO:164 also lacks exception isolation. It is not
claimed to be a newly introduced flaw in caller2de. The canonical reconcile
wake at RO:235 calls RO:533; the latter synchronously clears timers and starts
generations. Neither registration nor the proposed handoff declares or
enforces a no-throw callback guarantee. The probe injects a callback failure
at that local boundary; it does **not** claim a particular production network
error already exercised the future listener.

Required correction: complete the bounded notification pass through the
existing owner even if one registered wake fails; expose the failure
truthfully without reverting the completed transfer, repeating its byte
release, or skipping the remaining obligations. Preserve the fixed snapshot
so registration during a wake cannot make one release walk unbounded.
No new retry framework is requested.

### PO-4 — diagnostics erase the standing charge during an endpoint-free interval

**Lower severity: diagnostic truth, not actual premature credit release.**
PO:443–481 finds the pool only through the current endpoint owner. After
successful transfer and retirement, reading diagnostics for the same service
returns zero retained bytes, false `terminalRetained`, and zero history.
Registering a new same-node endpoint immediately reveals the still-existing
16,384-byte charge and old terminal descriptor.

P:181, `standing-charge-diagnostics-after-retirement`, records all three
snapshots. Actual accounting correctly remains conservative; this finding
does not claim that row data can borrow Rterminal. However, the newly promised
node-lifetime retained charge becomes invisible exactly while it outlives all
endpoints, so the status cannot explain its actual owner/lifetime.

Required correction: the existing diagnostic surface must either observe the
node's retained pool without allocating a new endpoint, or explicitly
represent that it lacks the observation. It must not turn a missing endpoint
into affirmative zero-capacity/empty-history evidence. Diagnostic state
remains projection, never permission to free bytes.

## Positive evidence retained

1. Exact-capacity first reservation debits 16,777,216 bytes atomically and uses
   zero root-session slots. The split is 16,760,832 listener + 16,384 terminal.
   One byte below that capacity refuses with zero retained charge
   (P:43, P:70; PO:249–274).
2. Wrong shutdown identity and a thrown callback without cross-owner reentry
   retain the full charge. A later valid callback completes.
3. Terminal state is installed and the transport pointer cleared before the
   positive wake. That wake observes 16,384 retained bytes and can reserve a
   successor immediately at the same 16 MiB cap. Stale duplicate release is
   false and cannot subtract the successor's bytes.
4. The ordinary valid path's owner and shutdown record are collectable after
   terminal transfer and retirement (P:102–119). The PO-1 retention is therefore
   not inferred merely from a counter or a deliberately retained test record.
5. The existing classified file independently passes 64 assertions. Existing
   virtual-time expiry and resize checks remain positive. Those assertions do
   not cover PO-1 through PO-4 or certify the actual MessageRouter graph.
6. No new timer, queue, Raft path, durable ledger or fallback release was added
   by this slice. Source inspection finds new listener APIs only in this owner
   and the focused test. Full transport remains unimplemented by declaration.

## Native prerequisite: independent narrow check

Native packet manifest
`0be370529fc9d4a18a5f9587c25030aa02e55b3b87a9c0480eaa493f5f32ff3f`
has 11 matching entries. D/`verify-native-inputs.py` additionally verifies
the retained binary/source archive hashes against the signed SHASUMS, extracts
the executable digest, and compares all 16 cited source members. All 36
checks across the native and implementation packets match.

The exact executable used for both the 64 assertions and independent
counterexamples is:

`1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`
— Node 22.22.0, libuv 1.51.0, Linux x64.

The detached SHASUMS signature independently reports GOODSIG/VALIDSIG for the
retained release key fingerprint
`CC68F5A3106FF448322E48ED27F5E38D5B0A215F`. GPG's temporary-keyring
permission and undefined trust warnings are retained, not hidden. This checks
the pinned supplied key; it does not independently rediscover its web-of-trust.

The signed distroless relationship and compiled/allocator graph measurements
were read in NATIVE/`certification-report.md`,
`commands-and-results.md`, `profile-identity.json` and
`native-cap-ledger.json`; they were not all re-executed in this bounded source
review. Exact reference binary/source correspondence is supported. Future
OCI/Helm, SEA, npm/source and lab candidate certification remains **HOLD**.
No existing required recovery capability becomes optional, and the historical
image is not selected as a future release artifact by implication.

## Category-complete disposition — all 63 items

“Pass” means the stated bounded observation only. “Open downstream” is an
explicit declared gate, not a source correctness pass. “N/A” states why the
item has no additional operation in this source slice. Findings are described
once above and referenced here rather than duplicated.

### Admission and evidence consumption (A1–A7)

| Item | Disposition and concrete evidence |
| --- | --- |
| A1 Same precheck/enforcement state | **Fail PO-1.** The pool debit uses the same PO:249–274 state (positive P:43/70), but descriptor admission PO:99 and retained consumption PO:341 read different values across PO:327. |
| A2 Transient/hard refusal | **Fail PO-2.** PO:328–336 returns false as a retryable held transition; P:148 proves it can instead leave an unreachable owner. Static invalid descriptor and ordinary callback failure still retain bytes (LT:278–328). |
| A3 Existing budgets | **Pass slice / downstream open.** PO:11–17, 249–274 preserve 128 MiB aggregate, 16 MiB base and 8 sessions. The standing bank has process lifetime, no TTL. Caller/attempt deadlines remain in unchanged RO:411–460; this helper starts no wait. |
| A4 Canonical result/reason shapes | **Fail PO-1/PO-3.** PO:240/303 promise claim-or-null/boolean and fixed terminal result; final-copy and wake exceptions escape after internal mutation (P:122/165). No wire reason schema is introduced. |
| A5 Observable credit release | **Fail PO-3; positive P:43.** PO:346–354 releases exactly Wlistener before the wake; a failed first wake skips later notifications. PO-2 has no valid release route after retirement. |
| A6 Current authority at consumption | **Fail PO-1/PO-2.** Initial exact service/claim/shutdown checks PO:307–314 are sound on the positive path; the callback boundary can change descriptor/owner before PO:338. |
| A7 Truthful held state | **Fail PO-4.** PO:443–475 reports an endpoint absence as zero despite retained node state (P:181). No claim that this projection itself frees bytes. |

### Retry and bounded progression (Y1–Y7)

| Item | Disposition and concrete evidence |
| --- | --- |
| Y1 Trusted retry fires | **Fail PO-2/PO-3.** Valid retry succeeds in P:43, but P:148 strands it and P:165 skips a later wake. RO:235, 533 remain the real existing reconcile wake; no new loop is proposed. |
| Y2 Bound with unreadable evidence | **N/A new database reads.** PO:240–355 is synchronous memory-only. Read/attempt deadline behavior remains RO:241, 411; physical native drain is downstream. Failed-callback retained-capacity honesty fails through PO-2. |
| Y3 Every exit owned | **Fail PO-1/PO-3.** Capture/copy and wake throws are not owned boolean exits. Invalid identity/capacity null at PO:253 and static transfer false at PO:307 are explicit. |
| Y4 Mutual waits | **Fail PO-2, not a new distributed cycle.** Active claim blocks every successor while its removed endpoint cannot finish. The positive exact-capacity successor at P:43 shows a legitimate completion path without competing capacity. |
| Y5 Attempts/concurrency ceiling | **Pass arithmetic, fail retained shape PO-1.** PO:253 admits one active listener per node pool and no session slot; callback iteration is snapshotted PO:354. No new timer/log/queue population. Actual MessageRouter 2/2 population and coefficients remain downstream. |
| Y6 Duplicate/late release safety | **Pass normal identity path.** PO:307–324 and 339–353 consume one capability; LT:190 and P:43 reject duplicate/recursive completion. PO-2 is the distinct failed-transition exception. |
| Y7 Reset versus ACK | **N/A ACK path.** PO has no ACK or attempt renewal operation; first-check PO:288 clears only the old diagnostic descriptor, never its charge. Unchanged RO holds caller/attempt budgets. |

### Delivery and wake interaction (T1–T5)

| Item | Disposition and concrete evidence |
| --- | --- |
| T1 ACK is not processed | **Pass local boundary / downstream open.** PO:333 requires the exact supplied terminal result, not truthy ACK; P:148 wrong-result case refuses. Native drain evidence supplied by actual MessageRouter remains unimplemented. |
| T2 Late callback handling | **Pass normal stale calls, fail PO-2.** Claim identity checks PO:307 and tombstone PO:350 prevent a completed old claim taking successor credits (P:43); retirement within the live callback loses its owner. |
| T3 Outcome classification | **Fail PO-1/PO-3.** Same result-shape defects as A4. The helper adds no SERVICE_RESPONSE classifier; caller source is unchanged. |
| T4 Undeliverable bounded | **N/A network delivery in this slice.** PO:240–355 performs no send, ACK wait or handler lookup. Router no-handler/socket/drain behavior remains the declared downstream gate, not approved by this report. |
| T5 Stub fidelity | **Scoped.** LT:133 and P:21/30 use real pool operations and controlled terminalize/wake callbacks with complete identities. They accurately expose this API boundary; they do not create native Immediate, HTTP/ws or SQL delivery evidence. |

### Timers, authority and lifetime (S1–S5)

| Item | Disposition and concrete evidence |
| --- | --- |
| S1 Injected clock/unref | **Pass unchanged row timers.** PO:54–61 and 224–228 retain injected clock and unref; LT:96–111 advances virtual time. New listener claim adds no timer. Physical two-check lifetime remains downstream. |
| S2 Authority gating | **Pass local ownership only.** PO:246, 307–324 use boot-domain value and exact opaque claim/service/shutdown identity. No Raft-authorized decision or current leader claim is made by this helper. |
| S3 Process-memory crash equivalence | **Scoped.** PO:39–41 stores volatile ownership; process teardown reclaims it and durable source obligations are outside this module. P:102 proves normal reference collection; no restart/service-reconstruction approval follows. |
| S4 Legal retention windows | **Fail PO-1/PO-2.** No TTL prematurely frees Rterminal (PO:436); however poisoned descriptors or stranded owner can retain an unbounded graph or unrecoverable listener. Static failed mutation followed by later success passes P:43. |
| S5 Starvation | **Fail PO-2/PO-3.** Exact source counterexamples prevent canonical progress. No new sweep or database admission dependency is added (PO:240–355); startup starvation proof remains downstream. |

### Recovery and replay (R1–R5)

| Item | Disposition and concrete evidence |
| --- | --- |
| R1 Stale state versus live | **Pass completed-old-claim guard, fail callback freshness PO-1/PO-2.** PO:307 and 350–353 reject stale updates; PO:327 crosses the unguarded mutation boundary. |
| R2 Restart/live discrimination | **Pass local discriminator / no restart claim.** PO:258–262 stores exact claim, boot, generation and shutdown record. LT:233 resumes same node pool through a new endpoint; actual process restart has no retained JS pool. |
| R3 Obligations not erased | **Pass no durable writes; fail reachability PO-2.** PO does not delete CDC rows or ACK obligations. It does erase the sole in-memory completion endpoint while retaining an active charge in P:148. |
| R4 Replay CAS | **Pass successful transfer.** PO:323–324 disables recursive release; PO:339–353 tombstones it. P:43 observes one release and unchanged successor accounting after duplicate completion. |
| R5 Absence not completion | **Fail diagnostic PO-4 only.** Missing endpoint becomes false-zero observation (P:181); actual pool deletion PO:436 is correctly forbidden once terminalRetained. No missing durable row is consumed here. |

### Concurrency and serialization (C1–C5)

| Item | Disposition and concrete evidence |
| --- | --- |
| C1 Synchronous gate/backstop | **Pass acquisition.** PO:253–274 checks and writes same pool synchronously before exposing claim; P:43/70 covers exact and short capacity. Local callback transition has PO-2. |
| C2 Post-boundary revalidation | **Fail PO-1/PO-2.** There is no await, but PO:327 is synchronous external-code reentry; subsequent descriptor and owner state are not protected coherently. |
| C3 Single-winner transfer | **Pass successful path; fail partial exception PO-1.** Opaque WeakMap state and TRANSFERRING block duplicate transfer. A final-copy exception leaves terminal state attached as the active claim. |
| C4 Callback reentry | **Fail PO-2/PO-3.** P:148 retires inside terminalize; P:165 throws from first wake. P:43 is the synchronous successor positive control. |
| C5 Actual resource key | **Pass normal node-scoped endpoint.** PO:63–81 keys all endpoints by canonical nonempty nodeId; P:148 fresh same-node endpoint sees the same stranded pool. This is no proof for arbitrary mutable/missing service identity; production composition remains downstream. |

### Formation and self-dependency (F1–F5)

| Item | Disposition and concrete evidence |
| --- | --- |
| F1 Full allocation/read/write inventory | **Scoped complete.** PO:240 allocates owner/pool as needed, claim and state, and charges base; PO:317 allocates fixed result, PO:341 descriptor, PO:354 wake snapshot. PO:277 clears old projection. PO:418 retires endpoint/session state. No SQL/cache/network read. PO-1 exposes the extra retained graph. |
| F2 Redrive without recovered state | **Fail PO-2/PO-3.** Memory release can notify unchanged RO:235/533 without cache hydration; the demonstrated exception paths remove that local progress guarantee. Native listener integration remains open. |
| F3 Formation caller budget | **N/A new client operation.** No client wait added by PO; unchanged RO:411–460 retains accepted caller semantics. No full formation/startup approval is inferred. |
| F4 Aggregate window/math | **Pass stated base arithmetic, fail actual custody PO-1.** P:43/70 proves 16 MiB split and exact-capacity successor; a 1 MiB selected-field graph is not within 16 KiB. Full A/I/S/H/C/K and >16 MiB event proof remains downstream. |
| F5 No bypass | **Pass slice.** PO uses the existing node pool and exports no raw Raft/SQL, force-open or alternate ledger path. Correction must remain in these owners; no bypass was used by diagnostics. |

### Harness and evidence fidelity (H1–H6)

| Item | Disposition and concrete evidence |
| --- | --- |
| H1 Red mechanism | **Pass evidence.** P:81/122/148/165/181 reach actual frozen source states; negative exit is caused by recorded correctness observations, not setup/import failure. The corrected native-check setup error is separately logged. |
| H2 Faithful seam | **Pass bounded seam only.** P imports exact PO directly. Callbacks act through public APIs; no replacement pool or capacity mock. LT and P do not certify native router/transport or startup. |
| H3 Time order | **Pass local order.** Callback reentry is synchronous, with no compressed deadlines. GC witness uses completed helper + two actual event-loop turns + matched normal control. No claim about native check phases. |
| H4 Complete descriptors | **Pass fixture fidelity.** P:16 uses all seven occupancy fields plus generation, issued-domain boot 1, exact claim and shutdown object; hostile mutations occur after complete valid admission. |
| H5 Nonvacuous state | **Pass evidence.** Actual 16 MiB charge, 1 MiB Buffer, active claim, successor allocation, wake count and retained endpoint-free charge are recorded in counterexamples.json. |
| H6 Actual graph versus model | **Pass bounded evidence / downstream open.** PO-1 direct object identity plus normal-versus-mutated WeakRef control establishes actual retained local graph. This is not the actual MessageRouter Promise/Immediate census, which AUTHOR explicitly leaves open. |

### Owner interaction (O1–O10)

| Item | Disposition and concrete evidence |
| --- | --- |
| O1 Sole budget owner | **Pass architecture.** PO nodePools owns all new charges; no second budget store. The mutations inside that owner have PO-1/PO-2. |
| O2 Canonical typed transfer | **Fail PO-1/PO-3.** One API and terminal result shape exist at PO:303–355, but selected descriptor custody and error outcomes are not canonical across the callback. |
| O3 Boundedness and progress together | **Fail PO-1/PO-2/PO-3, positive P:43/70.** Same exact source both completes legitimate control and exhibits refusal/recovery gaps; fixing only rejection would be insufficient. |
| O4 Old then new generation | **Pass positive LT:190–255/P:43; fail PO-2 exception.** Completed old calls cannot release successor, but failed retiring callback can prevent every successor. |
| O5 Pressure/backoff | **Pass fixed arithmetic; no new loop.** PO:253 refuses insufficient bytes before charging, P:70. Existing row pressure check PO:187–223 remains; listener base is standing infrastructure, not a newly unbounded row attempt. |
| O6 Canonical wake | **Fail PO-3.** Snapshot-before-iteration at PO:354 bounds the pass; a thrown callback skips the rest. RO:235/533 is the existing real consumer, not a new retry owner. |
| O7 Projection is not authority | **Pass successful release authority, fail PO-4 diagnostics.** Release requires exact claim, not counters; no test frees bytes based on diagnostics. PO-1 shows scalar projection itself can retain data, separately. |
| O8 Exact source treatment | **Pass evidence.** source-ledger.json and git-object-checks.json bind live/snapshot bytes; focused-test.txt and counterexamples.json name same runtime/source. No fabricated predecessor/source-green or native coefficient claim. |
| O9 No escape routes | **Pass slice inventory.** Search finds listener API callers only in LT; RO remains the canonical existing wake consumer. No raw access or alternate-success path was added to get green. Missing future MessageRouter caller is explicit, not a hidden implemented claim. |
| O10 Contract/metadata/witness alignment | **Registered but incomplete proof.** test/shards/impact-contracts.json:907/938 and 1830/1852 cover PO/LT; primary-classes.json:319, resource-classes.json:318 and subsystem-classes.json:338/3331 register LT. Future router interaction proof remains required; new corrections must add the PO-1–PO-4 witnesses through this same registered test surface. |

### JavaScript boundary and arithmetic (J1–J8)

| Item | Disposition and concrete evidence |
| --- | --- |
| J1 Numeric domains/derived math | **Static lattice passes except noncanonical -0; fail post-capture domain PO-1.** B refuses NaN, infinities, negatives, unsafe integer, boxed Number and numeric string. -0 is accepted and retained as zero (no accounting escape demonstrated); a canonical capture should normalize or explicitly reject it. Caps bound valid sum to 16 KiB. |
| J2 Own fields | **Fail PO-1.** PO:99–138 accepts inherited descriptor fields; B records zero-own-field accepted input. Fixed scalar capture must establish owned evidence before consumption. |
| J3 Getter/TOCTOU | **Fail PO-1.** Repeated validation reads and final reread after terminalize permit changed values and an uncaught late getter. P:81 shows even plain data mutation suffices; P:122 shows exception damage. |
| J4 Prototype defenses | **Fail same descriptor boundary PO-1.** Inherited-field observation B applies here; no claim that an unrelated prototype field can take authority through a map. No separate arbitrary-host pollution framework is requested. |
| J5 Primitive/exotic values | **Static pass, later consumption fail PO-1.** Generation string check PO:49 and numeric check PO:107 reject boxes normally; B confirms Number/string refusal. Callback mutation can still replace a validated numeric slot with an object. |
| J6 Mutable intrinsics | **N/A arbitrary hostile runtime replacement.** Number/Buffer/Object/Map built-ins are the existing trusted in-process host boundary. No design permission for arbitrary monkeypatch immunity is inferred. PO-1 reproduces without changing any intrinsic. |
| J7 Serialization/coercion | **Scoped pass for generation bound; fail scalar-copy guarantee PO-1.** PO:49 type-checks before Buffer.byteLength; this slice hashes/serializes no wire payload. Numeric guard rejects coercible boxes before arithmetic on a stable record, but repeated reads break stability. |
| J8 Bounded authentic collections | **Pass external shape scope.** No caller-supplied array enters the new APIs; PO:103 uses a literal seven-item array, PO:354 snapshots internal Set. Actual graph selection can be unbounded via PO-1. Full transport metadata/concurrency remains downstream. |

## Required next checkpoint and retained gates

The source repair is bounded to the canonical transfer-owner interaction:
capture its terminal descriptor once, preserve a reachable exact owner through
callback/reentrant retirement, complete release notification despite an
individual callback error, and report standing custody truthfully. Retain the
64-assertion result as component evidence, then add the counterexamples and
same-source valid controls to the registered witness before re-review.

This report does not demand the unimplemented MessageRouter adapter or runtime
graph coefficients already pass. Those remain explicit gates: actual native
shutdown record and two Immediate/Promise overlap, transitive callback/parse/
send roots, listener admission/port ownership, complete S/H/C/K and fixed-bank
allocation accounting, supported 8 MiB colocation, one >16 MiB event versus
large backlog, cumulative interrupted/replay/ACK controls, required exact
candidate artifact certificates, normal startup recovery, BEGIN/activation/
whole-operation resource work, FreshMG physical replacement and merge gates.

No product source/test/design, Quest, index, commit or branch was modified by
this review. Only this report and D diagnostics were written.

