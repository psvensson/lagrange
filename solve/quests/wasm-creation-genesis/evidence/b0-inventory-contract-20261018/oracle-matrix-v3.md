# B0 inventory contract v3 — scenario and oracle matrix

**DESIGN ORACLES FOR INDEPENDENT REVIEW. No new dynamic pass is claimed.**
Author `/root/rsraft_b0_contract`, 2026-10-18. Pair with `inventory-contract-v3.md`;
review must bind both complete bytes. Source is exact U1
`a251ce4fd9c980a78c0fd33d8a5f873161f90870`, identical in `src/` and `test/` to
planning base `a1c3cde54fcb46471791062bcae4a6000ae484e0`.

## Fidelity and required observations

I is a predecessor; J a successor; F a distinct future PENDING origin; I1/I2
are two historical obligations. Use real retained intents, tokens, resource
CAS/selection, opening files and directory owner. Suspend real owner calls at
explicit gates; do not replace the answer being proved with scripted authority.
Route-only scripted cells are permitted only beside the corresponding real-owner
interaction witness. Equal timestamps are valid and must not become a tie-break.

For every multi-origin row below execute [I,J] and [J,I], then [I1,I2,J] with
at least J-first and J-last. When relevant, hold an old result until J becomes
current. Check all of: original journal states/token, exact resource phases,
physical current object and local record, handler memo and gate identities,
manager canonical state/owner, driver prepared/running/context entries, exact
physical services/endpoint rows, emitted outcome identity and actual invocation
counts. A returned boolean or memo alone does not prove these facts.

Use the existing classified runner and real process owner for later execution;
no test is run by this B0 document. ABI, missing data, zero-test discovery,
timeouts before the asserted interaction and skipped native prerequisites are
not counterexamples or passes. Orderly reconstruction does not claim SIGKILL
or U2 C9 proof. Component metadata is not production replicated metadata.

## Observation, application and lifetime (F2)

| ID | Setup and interleaving | Required oracle; what must fail on a defective implementation |
| --- | --- | --- |
| B02-01 | Two calls begin before ready; first journal read suspended; second caller arrives; then release read and await both | One underlying journal scan and one application; callers share completion. Assert the scan count before release, then release **before** awaiting both. No stale HELD write after ACTIVE. A later call returns the applied result without another scan. |
| B02-02 | Whole read throws/unavailable, non-array result, conflicting duplicate operation observations; retry after repair | No plan application, readiness opening, metadata effect or continuation. One failed startup attempt can be explicitly retried while live. Identical duplicate rows fold once; different origins never fold. |
| B02-03 | Real journal row crosses PENDING→IN_PROGRESS at the old two-query gap | New owner query reads recoverable states in one statement at the actual storage boundary: one row/plan/initial attempt. Do not claim atomicity across local files or RPC aggregation. Verify existing single-state list callers and generic resolver behavior. |
| B02-04 | Stop while journal read or each local inspection await is suspended; release actual owner and acquire a successor; then release old answer | Old handler neither recreates memo, opens ready, emits outcomes nor invokes continuation. Read-only inspection closes its connection. Successor acquires/progresses independently; the cancelled scan need not hold shutdown forever. |
| B02-05 | Stop after final observation before application, after ready before deferred callback, while waiting for gate, and just before settle | One irreversible stopped lifetime fences every cut. No new effect admission, mutation or emitted outcome; stale callbacks cannot write into successor lifetime. Already admitted physical effects remain covered by B04. |
| B02-06 | Mixed generic, foreign-node, undecodable origin, decodable corrupt admission/opening and valid bound rows | Preserve canonical total per-row diagnostics and foreign-node filter. Handler does not rerun generic rows. Scan and local inspection make zero reserve, metadata resolve, physical-open or tombstone calls; no fabricated origin from corruption. |

## Exact CREATE/wake precedence (D1 and F6)

The dispatch table in contract §5 is normative. These rows exercise every
exception plus all original no-plan fallback cells; none changes reservation
finality or grants physical opening from a plan.

| ID | Setup and interleaving | Required oracle |
| --- | --- | --- |
| BD1-01 | Retain future tokenless F and current J; J ACTIVE; F first attempt refuses; actually advance the resource prerequisite, then redeliver unchanged original CREATE F | Route F, never RV7.3 foreign-conflict solely from J's memo. F's original journal and eventual exact token remain F. Physical live-J fence still decides whether opening can proceed. F's refusal cannot replace J; later after legitimate J retirement F can progress through ordinary authority. |
| BD1-02 | Same sequence while J HELD and deferred-FAILED | F's matching retained plan takes precedence over RV6.2; invocation and outcome use F, not `existing.operationId=J`. J receives no borrowed success or substituted work. |
| BD1-03 | J REMOVING with admitted retirement; exact CREATE F arrives; retirement settles held and then succeeds on explicit retry | F waits on the same canonical gate and cannot overlap the retirement. It receives one own attempt after gate settlement, even if J's memo remains REMOVING; owner refusal remains authoritative. No second pending record under wake storms. |
| BD1-04 | F's previous CREATE result permanent but original journal nonterminal; another creation owns memo; later original F redelivery | Retry F through the same owner route, possibly returning the same permanent refusal. Preserve F debt. No immediate retry loop and no event-driven retry from a permanent result. Permanent memo does not capture an unrelated request (RV7.2). |
| BD1-05 | Token absent at scan, then real original journal retains admission; receive matching and mismatching token-bearing wakes | Only authoritative original continuation/reread can update F's token. Old absence cannot match an invented token; once retained, complete exact binding/token matches. A second different token/intent is conflict, not replacement. Tokenless F has no promised native wake. |
| BD1-06 | Applicable native wake for admitted F after F settled and J owns ACTIVE/HELD memo | Lookup exact in-flight origin, then exact plan, then fallback. Queue F through common gate only for permitted reason and EVENT_OR_REDELIVERY. One pending wake if F in flight; consume once after a deferred settle, behind initial waiters. |
| BD1-07 | Wrong service/origin/token, absent operation, RESOURCE_CLOSED, GRANT_HELD with UNAVAILABLE, terminal or retirement-only F | Mismatches have no effects. CLOSED and UNAVAILABLE are record-only; neither queues nor leaves pending reentry. Retirement-only and terminal plans cannot CREATE. Preserve Recovery Revision 5. |
| BD1-08 | Original row became COMPLETED, CANCELLED or FAILED after scan; original CREATE/REMOVE redelivery | Authoritative terminal read, no reopen or fresh journal. CREATE retains its ordinary terminal failure/disposition; REMOVE treats COMPLETED/CANCELLED as complete and FAILED as typed failure. No successful terminal-row result borrowed for J. |
| BD1-09 | No retained-plan match: named ACTIVE J with same-id and different-id request | Exact current/eligible same-id retains ALREADY_EXISTS + CREATE_ACTIVE. Foreign request retains ALREADY_EXISTS + CREATE_FAILED CONTENT_CONFLICT under that request, with J untouched. No plan exception leaks to a genuinely foreign request. |
| BD1-10 | No plan: named HELD/deferred-FAILED J receives same/different ID; named permanent FAILED/REMOVED receives later J | HELD/deferred resumes the memo origin under RV6.2. Permanent/REMOVED routes the request under RV7.2. Never dead-origin capture of a later request. |
| BD1-11 | No plan: named REMOVING; nameless HELD; generic absent/CREATING/FAILED/REMOVING | Preserve RV6.3 retirement deferral and no route, RV6.4 corrupt HELD refusal/no effect, and unchanged generic paths. Collision pending-current is its own explicit state, not nameless HELD. |
| BD1-12 | ACTIVE F memo becomes stale through direct manager stop/new current J before duplicate F CREATE | Synchronous physical owner currentness/eligibility controls success. No CREATE_ACTIVE from a stale memo. Known F can continue its own route; no-plan unavailable currentness returns typed retry, not a fabricated success. |
| BD1-13 | Exact operation ID reused with conflicting immutable entity/replica/node/intent or wake token | Typed identity conflict before plan routing. No metadata call, memo replacement, borrowed token or outcome under another origin. |

## Common admission and settlement (F3)

| ID | Setup and interleaving | Required oracle |
| --- | --- | --- |
| B03-01 | Ready opens with RETIRED I; coordinator REMOVE enters before queued startup callback; reverse order | At most one canonical admitted retirement at a time. Same-origin startup consumes the exact admitted settlement including journal completion; startup emits no executor outcome. Coordinator emits only under its original REMOVE request. |
| B03-02 | Bound CREATE, wake, startup I/J, and coordinator REMOVE contend for one canonical key; first owner synchronously reenters handler | Stable gate installed synchronously before any callback/await/owner call. REMOVE target captured at admission; delayed body never rereads later memo to choose J instead of I. |
| B03-03 | Repeat same admitted REMOVE; different request arrives while busy | Same exact request/target gets IN_PROGRESS without a second obligation. Different request gets typed unadmitted BOUND_OPERATION_BUSY/deferRetry and no outcome. Later explicit caller retry can admit. Verify actual caller handles this as refusal/retry, not accepted work. |
| B03-04 | Old entry's finally/settlement arrives after newer same key/request slot installed | Old settle cannot delete new entry, overwrite its state, resolve its waiters or emit its outcome. Exact entry identity and handler lifetime are both required. |
| B03-05 | I unresolved, J initial waiting, repeated permitted wakes for I, additional initial I2 | Release gate after one attempted result; J/I2 receive their initial turns before I's coalesced follow-up. No recursive immediate retry, starvation, unbounded accepted queue or debt loss. |
| B03-06 | I initially REENTER; an explicitly admitted REMOVE transfers I to retirement-only; closure or completion returns UNKNOWN; J later current | Transfer records exact admitted target/request before owner await. I stays retirement-only; CREATE/wake cannot reopen it. Separate journal debt survives, and the next bounded already-authorized historical pass retries I without targeting J. A never-removed REENTER origin is excluded from that pass. |
| B03-07 | Successful current-J REMOVE sees I1/I2 retirement-only debts; a debt remains unresolved | One pass over captured eligible debts, at most one attempt each, no coordinator outcome for them. New arrivals/failed historical results cannot recursively extend that pass. J's captured outcome remains J's. |

## Physical task lifetime and directory custody (F4)

| ID | Setup and interleaving | Required oracle |
| --- | --- | --- |
| B04-01 | No active object, exact published file; by-path retirement pauses in metadata release; shutdown begins | Real successor directory-owner acquisition remains refused while old task can still tombstone/close. Release gate, await task and shutdown, then actual successor acquisition succeeds. No old post-transfer write. |
| B04-02 | Pause at local tombstone/close boundary; shutdown invoked synchronously from first collaborator; repeat shutdown | Retirement registered before first async/reentrant collaborator; all admitted tasks joined, none missed from an earlier snapshot. Closing irreversible and exact duplicate task coalesces. |
| B04-03 | New retirement or create after shutdown close; create while by-path retirement owns same service | Typed refused/fenced admission; no physical open or second mutable task. Direct manager callers obey lifecycle fence independently of handler gate. Different origins never coalesce by canonical service alone. |
| B04-04 | Live cleanup rejects while SQLite/native resources stay open, then repeated shutdown retries | Shutdown rejects and actual directory owner remains held. No release in failed-cleanup finally, no reopened admission; cleanup retry can discharge retained custody before transfer. |
| B04-05 | Metadata unresolved but local resources fully closed and exact task can no longer touch path | Physical task may settle and release process lifetime; durable original journal debt remains pending. A later owner reconstructs it from journal/local evidence. Do not keep a process forever merely because authority is unavailable, or discharge journal debt to release it. |

The production wrapper `data-directory-process-owner.js:64–72` already releases
only after shutdown fulfillment. Preserve it and prove the complete lifecycle
join reaches that wrapper; the embedding must use its actual owner, not a boolean
"released" stub. Production recovery reader/startup wiring remains lane D.

## Historical physical finality, projection and journal completion (F5)

| ID | Setup and interleaving | Required oracle |
| --- | --- | --- |
| B05-01 | Old I locally RETIRED and resource CLOSED, original completion failed; actually close every old resource and select J so old history is lost | Owner returns terminal LOCAL_RETIRED_HISTORY using exact RETIRED/ALREADY local evidence + HISTORY_UNAVAILABLE. Runtime projects exact I STOPPED, original completion confirms COMPLETED, handler settles I. J's physical object/projections stay unchanged. No false CLOSED CAS serialized. |
| B05-02 | HISTORY_UNAVAILABLE paired with missing storage, corrupt record, conflicting immutable identity, unreadable local state, or bare `retired:true` | Not historical terminal proof. No unsafe tombstone, STOPPED acknowledgment claim or original completion from those combinations. Preserve existing missing-storage + actual CLOSED positive case separately. |
| B05-03 | Actual CLOSED and local cleanup; completion write unknown, write applied but read unknown, confirming reread unavailable; then restore owner | Physical proof retained but completion remains UNKNOWN; coordinator HELD/startup WAITING_TRIGGER, no full completion. Exact idempotent original path later confirms one COMPLETED row. No STOP journal/new creation/token. |
| B05-04 | STOPPED writer missing, throws, returns undefined/malformed, RETAINED, or `applied:false` | Explicit projection-pending result; completion CAS not called. Nonthrowing callback is not applied proof. Retry later uses same exact physical row and actual acknowledgment. |
| B05-05 | Exact STOPPED request returns `applied:true`, including genuine already-absent no-op | Acknowledgment means that submitted exact physical row is absent under its owner, not an unrelated row/count. Completion follows only afterward. Test real idempotent no-op and guard against scripted generic success. |
| B05-06 | Endpoint removal fails/retains but physical retirement succeeds | Raw endpoint result preserved; no claim endpoint absence from best effort. Exact incarnation/physical identity prevents I cleanup deleting J; remaining production endpoint continuation remains D's explicit obligation. |
| B05-07 | Crash/restart at release, local tombstone, authority close, STOPPED applied, and completion confirmation | Reconstruct same original origin/token and remaining stages at every cut; no reopen after terminal physical proof, no early journal completion, no repeated unrelated effects. Include later authority-history loss and both inventory orders. |

## Every retained origin and current projection (F6)

| ID | Setup and interleaving | Required oracle |
| --- | --- | --- |
| B06-01 | I RETIRED + J REENTER, then I/J both ABSENT_UNCLAIMED REENTER, each order | Each distinct original plan retained and gets initial attempt independently of memo ownership. J is not hidden by I's last row or failure. A REENTER-first sort is insufficient and must be killed by the second pair. |
| B06-02 | I1/I2/J with several legitimate ADMITTED/PUBLISHED records and no physical current object | Owner decides actual opening; at most one current object. Every original is attempted once. No selection version, phase, array order, timestamp or lexical-ID winner/automatic retirement. If all unresolved, pending-current persists and canonical REMOVE/foreign CREATE defer typed. |
| B06-03 | Old prepare/start/confirmation await resumes after direct manager J admission; old retirement settles after J current | Immediate synchronous physical observation fences manager and handler writes. Current+ELIGIBLE required for CREATE projection; stopping/current+FENCED cannot publish creation success. Old retirement may complete I journal without owning canonical state. |
| B06-04 | Inspect each generic and bound manager map writer; driver prepared/running/context stores; old result delayed at each await | One canonical manager state/ownership record, generic getter behavior unchanged. No mixed record shapes or shadow currentness map. I cannot start J's prepared object, mark J running, clear J bookkeeping or delete J services/endpoint. |
| B06-05 | Physical observation dependency unavailable/malformed, CURRENT exact stopped object, ABSENT, DIFFERENT J | Consume typed owner observation unchanged. None can become CURRENT/ELIGIBLE by memo inference. ABSENT permits only exact former-record STOPPED settlement, not opening authority or fresh CREATE success. |

## Preserved evidence and mutation obligations

Original U1 remains REJECT. Preserve all fifteen independently measured cases:
F1's three delayed-reservation cases (lane A); F2's late scan and overlap; F3's
redrive/REMOVE overlap; F4's by-path transfer; two predecessor/successor orderings
exposing F5/F6; older-REENTER successor-first; and five controls (journal-only
inventory, older-REENTER predecessor-first, three direct mutation controls).
Their exact paths/hashes are in `source-manifest.json`. The combined convenience
patch was **not** run as a combined suite historically; adopting it requires new
actual measurements. Keep the original files untouched.

The original thirteen killed mutations M01–M13 remain required behavior controls:
journal-only read; original operation identity; memo-before-ready; no completion
at PUBLISHED; actual RETIRED redrive; missing storage is not a tombstone; complete
local file identity; node filtering; no startup REMOVE outcome; PENDING resolve
before terminal; no UNAVAILABLE pending wake; corrupt retirement permanent
refusal; arbitrary lifecycle code remains deferred. Preserve their source-bound
history and remeasure adapted successor witnesses on the corrected source.

Additional mechanism mutations required by v3 (independently authored, exact
restoration, a passing unmutated control and a named assertion failure):

| Mutation | Required killing rows |
| --- | --- |
| Restore memo-first exact-plan dispatch or omit settled-plan wake lookup | BD1-01/02/06 |
| Drop post-await lifetime fence or clear successful startup promise | B02-01/04/05 |
| Retire through separate gate or choose REMOVE target after await | B03-01/02 |
| Delete map slot by request ID without entry identity | B03-04 |
| Requeue unresolved I immediately, or drop later retirement-only handoff | B03-05/06 |
| Register by-path task after first await, omit shutdown join, release on cleanup failure | B04-01/02/04 |
| Accept bare retired/missing storage as historical finality | B05-02 |
| Treat physical CLOSED, missing/RETAINED projection, or unknown completion as full completion | B05-03/04 |
| Drop exact-old projection/journal stage after HISTORY_UNAVAILABLE | B05-01/05/07 |
| Choose last/canonical/sorted row; erase noncurrent plan | B06-01/02 |
| Skip currentness/eligibility at manager, handler or driver settle | BD1-12/B06-03/04/05 |

A design APPROVE judges these oracles and the complete contract; it does not
claim any new mutation or dynamic case ran. Implementation acceptance later
requires the actual changed-owner cone, inherited-failure accounting, independent
exact-head review and fresh A+B interaction verification. Whole-U1 acceptance,
U2, production activation, lab certification and merge remain separate gates.
