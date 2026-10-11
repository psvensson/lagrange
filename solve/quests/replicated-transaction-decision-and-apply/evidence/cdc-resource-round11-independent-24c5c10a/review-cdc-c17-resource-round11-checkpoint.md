# C17 whole resource handoff: round-eleven design review

Date: 2026-10-11. Independent reviewer:
`subagent:/root/review_checkpoint_composition`.

## Scoped verdict

**REVISE DESIGN** at
`ce9e463cdfa829c1e5fd83ec49bde87fca0258d615b87b72582b46048ce23201`.

One complete grouped finding remains:

- **D24 — the final scheduler-record handoff assumes an unwind that has not
  occurred.** An awaited continuation can run from `processImmediate`'s
  between-callback microtask checkpoint. The executed second Immediate and its
  queue link are still reachable there. The amendment accounts for only a
  scalar destroy ID after asserting that the Immediate queue link is gone.
  Correct the bounded custody transfer for the actual residual records; another
  timing barrier is not requested.

The **two-check native close boundary is supported**: it fixes the early native
TCP-wrapper release established in D22. **D23 is closed at design scope**: the
new profile clause preserves all currently required delivery/recovery promises
and leaves concrete supported profiles with their existing owner. These two
positive conclusions are separate from the remaining scheduler-record issue.

The accepted standing 48-root batch, fixed subordinate banks, complete-pair
acquisition, both node orders, colocation, ACK/result, receive-phase and original
caller controls remain supported. The caller source
`2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains approved and closed.

**Resource SOURCE remains HOLD.** This is not approval of the coverage adapter,
runtime/release/deployment source, metadata, full startup, durable CDC delivery
or lost-ACK recovery, or merge to main. Artifact/native prerequisites and future
adapter coefficients remain distinct gates. No unimplemented test is being
required to pass to establish this design finding.

Only this report and diagnostics under `I` were written. No source, test,
design, Quest, index, commit or remote was changed. One small scheduler
mechanism diagnostic was executed; no cluster or application test was run.

## Exact subjects and references

`C` = `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.

`E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.

`D` = `C/solve/quests/replicated-transaction-decision-and-apply/cdc-coverage-response-resource-handoff-amendment-20261011.md`.

`I` = `E/cdc-c17-round11-review`; `I10` = `E/cdc-c17-round10-review`.

`P` = `C/solve/quests/replicated-transaction-decision-and-apply/evidence/cdc-runtime-allocation-certification-20261011T2100`.

`N` = `P/node-v22.22.0-libuv-v1.51.0`.

| Artifact | Verified identity |
| --- | --- |
| D, 2807 lines; retained `I/subject-ce9e463c.md` | SHA-256 `ce9e463cdfa829c1e5fd83ec49bde87fca0258d615b87b72582b46048ce23201` |
| Predecessor, 2551 lines / 166864 bytes | SHA-256 `0d725dc43b55eaaa4af10fe1b3eae809f96bbfabfeebef0d25e053be5cf06399`; entire prefix unchanged |
| New 256-line delta, `I/delta-d22-d23.md` | SHA-256 `7aefba0a4a05ba44b53e13577b233b9b75fd01316dd68d7b0b9fc9aea1495308` |
| Prior round-ten report | SHA-256 `81881308e0b4fc2ac4161cf3ae051d94591fc5a636a05d6e0750d7b705d5310e` |
| I10/diagnostic-sha256.txt | SHA-256 `576baff8ee80da5bc83cde5bf351cd2d18a859eb34fdab5a3c86df631a81a2f6`; all 18 entries unchanged |
| I/navigation.json | SHA-256 `ff182302edce4df95a66f44d39f88b98658882da8accfbd424196d68113c25e7` |
| Official Node v22.22.0 timers source, `I/native/timers.js` | SHA-256 `c0cb11238d8f10aba653926c9c0ee28aa7f49593100de7f013ffd61b9fa45c42`, matching D:2653 |
| Diagnostic executable | SHA-256 `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`; Node 22.22.0 / V8 12.4.254.21-node.33 / libuv 1.51.0, Linux x64 |

The full new section was read against its unchanged predecessor. All 34
application/deployment navigation paths still match round ten and pinned
`0e9a07604b5e29f0f686db3e567333c7775934df`. All four separately observed runtime
profile-owner paths also match their round-ten hashes. The native diagnostic
uses the retained v0.2.5 executable as measurement evidence, not as the selected
future rs-raft candidate or proof of executable-to-upstream-source provenance.

| Key | Concrete evidence path |
| --- | --- |
| Timers | `I/native/timers.js`, fetched from `https://raw.githubusercontent.com/nodejs/node/v22.22.0/lib/internal/timers.js` |
| Env / Async / Base / BaseInline | `I10/native/env.cc`; `async_wrap.cc`; `base_object.cc`; `base_object-inl.h` |
| NodeNet / Handle / UVCore / UVLinux / UVStream | `N/node-lib-net.js.txt`; `node-src-handle-wrap.cc.txt`; `libuv-unix-core.c.txt`; `libuv-unix-linux.c.txt`; `libuv-unix-stream.c.txt` |
| RO / CT / RC | `C/src/cdc/cdc-coverage-reconcile-owner.js`; `cdc-integration-service-authoritative-catchup.js`; `cdc-complete-coverage-reconcile.js` |
| PO / FC | `C/src/cdc/cdc-coverage-transfer-owner.js`; `cdc-coverage-fragment-consumer.js` |
| SC / ST / PE | `C/src/partition/partition-cdc-source-coverage.js`; `partition-cdc-coverage-transfer.js`; `partition-service-entry-apply-base.js` |
| CO / CN | `C/src/cache/system-table-cache-cdc-source-order.js`; `system-table-cache-observation-methods.js` |
| Domain / JSON | `C/src/cdc/cdc-coverage-domain.js`; `C/src/utils/canonical-json-data.js` |
| RI / RD / PL | `C/src/transport/message-router-inbound-dispatch.js`; `message-router-delivery-behaviors.js`; `message-router-pending-response-ledger.js` |
| Server / Shutdown / Bulk | `C/src/transport/message-router-server-lifecycle.js`; `message-router-stats-shutdown.js`; `bulk-transfer-channel.js` |
| Ports / Config / Helm / Headless | `C/src/config/listener-port-model.js`; `configuration-manager.js`; `C/charts/lagrange-node/templates/_helpers.tpl`; `service-headless.yaml` |
| AR / Registry | `C/src/cdc/cdc-integration-service-authoritative-read-flow.js`; `C/test/shards/impact-contracts.json` |
| Provenance / Content | `I10/source/src/diagnostics/runtime-build-provenance.js`; `runtime-content-fingerprint.js` |
| Release / Package | `C/.github/workflows/release.yml`; `C/package.json` |

Rules/router and the same ten verification templates supply the complete
63-item union. Existing canonical-data, trusted host/private network and
supported-platform boundaries are unchanged.

## Complete grouped finding

### D24 — callback completion does not prove scheduler-list unwind

Categories: timer/lifecycle, concurrency, final resource handoff and evidence.
Locations: **D:2638–2647, 2655–2663, 2679–2691 and 2794**.

The amendment correctly keeps Wbase through two nested checks and moves release
out of the second callback. It then makes a stronger claim: the awaited shutdown
continuation runs after `processImmediate` has returned, so the Immediate queue
link is gone and only a numeric async-destroy ID can remain in Node custody.
That claim does not hold for its exact cited timers source.

#### Actual source transition

Timers:437–448 takes the current queue and detaches it from the public queue;
this does not destroy the local list. Timers:450–456 invokes `runNextTicks`
between immediate callbacks. After the second barrier callback resolves its
promise, Timers:488–503 clears `_onImmediate` and advances the current node,
but retains the executed Immediate through `prevImmediate` and the linked
list. The microtask checkpoint before a following ordinary immediate can then
resume the awaited shutdown continuation while `processImmediate` is still on
the stack. A cleared callback is not a reclaimed Immediate record or queue link.

#### Independent exact-runtime counterexample and positive control

`I/immediate-unwind-probe.cjs` schedules the proposed two checks and one normal
independent companion immediate after the second. It resolves an awaited
promise from the second callback and inspects the continuation. It uses the
unchanged production Node executable, public `setImmediate`, a promise, and
V8 heap snapshots. It does not monkey-patch timers or retain the second handle
in a JavaScript variable. A marker property identifies its record in the
snapshot; that property points outward to a string and supplies no root.

Observed order in `I/immediate-unwind-events.json`:

    first-check -> second-check -> shutdown-continuation
                -> companion-check -> following-check

The continuation's actual stack includes:

    runNextTicks (node:internal/process/task_queues:65:5)
    process.processImmediate (node:internal/timers:453:9)

At that point `I/immediate-unwind-result.json` contains one marked **Immediate
object, 136 bytes in this instrumented graph**, whose `_idleNext` points to the
companion Immediate. `_onImmediate` is already cleared. At the following-check
control the marked object is absent. The observed size is not a proposed
production coefficient: the marker changes the diagnostic object shape.
The finding requires only the demonstrated reachable record and queue link.

This is not the previous native-wrapper failure: the two-check barrier has
already crossed native close processing. It is not an observed 512 KiB or
128 MiB overflow. It is a false final ownership premise: the proposal hands
off only a scalar after declaring a scheduler object/link gone when it remains
reachable. Calling remaining scheduler bookkeeping generically transferred at
D:2642 does not resolve the later explicit scalar-only accounting and claimed
post-`processImmediate` release at D:2658–2662/2685/2794.

#### Required bounded correction

Keep the two nested checks for the native boundary. Correct the final handoff
around **callback return and actual retained scheduler records**, without
requiring another blind barrier. A bounded transfer to the existing Node
scheduler/MessageRouter shutdown owner can be valid, provided that:

- the transfer names the actual Immediate/list/stack and completion-record
  references which remain, their bounded count/bytes and their final consumer;
- those references stay charged or move into an explicit already-owned bounded
  destination; they are not dropped from the accounting merely because they
  are Node-owned or no longer carry traffic authority;
- the selected profile's real between-callback checkpoint is permitted, and
  the completion record cannot authorize release twice or alter a successor;
- the terminal state and ownership transfer are installed before capacity
  return can synchronously wake an admission/restart consumer.

The last point follows the actual PO:62–81 release path, which invokes wake
callbacks synchronously after its own state update. The amendment must define
when the shutdown record becomes terminal and where residual custody moves
before calling that release. D:2687's successor exclusion must remain true even
if a wake immediately attempts to start the next generation. This is part of
the same final-handoff correction, not a separate newly claimed executed
successor regression.

There is no request for synchronous garbage collection, arbitrary async-hook
immunity, a new scheduler/store, or recursively adding callbacks to prove that
previous callbacks returned. The preowned terminal budget and existing owners
can provide a finite handoff contract. Its future source witness should include
this ordinary companion-immediate schedule, exact once release and synchronous
release wake/restart, in addition to the native two-check controls already
required.

## Positive conclusions and retained whole interaction

### Native close and payload custody are corrected independently of D24

D:2620–2637 first stops admissions/dials and waits for the exact A/I/HTTP/ws/
ledger/send/emitter ownership graph. Timeout retains Wbase rather than calling
it released. Only then does it schedule the first and nested second check.
All entry phases in D:2693–2708 use the same generation record, including no
listen, pending bind, partial startup and repeated shutdown. This is a coherent
proposal within the existing shutdown owner; the current Shutdown:162–257 does
not already implement the new record or exact drain and is not source-approved.

UVCore:474–475 executes native closing handles after check. Timers:443–448
separates newly scheduled immediates from the running list, so the nested second
check cannot execute in the first check's list. For the pinned runtime, a close
phase intervenes. Env:1571–1588 drains native immediates before invoking the next
JavaScript immediate list; Async:564–587 gives native destroy IDs that existing
owner. Handle:134–158 and Base:128–139 delete the detached native wrappers at
the actual close callback terminal. No pre-Socket observer retains them.

The retained round-ten native diagnostic gives the decisive paired evidence:
first check has one actual TCP socket wrapper and server wrapper; nested second
has neither. Those exact diagnostics and hashes remain unchanged. D24 does not
reopen native/root admission arithmetic, add a larger native population, or
suggest that payload/native custody is still unresolved by the two checks.

The 48×8 +16+64+16 =480 KiB standing envelope remains below 512 KiB. Its profile
must still attest the conservative native/layout/allocator/bookkeeping caps.
D:2666–2682 includes both terminal records in the existing 16 KiB term; the
remaining issue is their final custody, not an established inability to fit.

### D23 now preserves required recovery promises

D:2726–2732 explicitly covers published npm/source services, SEA artifacts,
OCI/Helm deployments and canonical lab candidates. D:2734–2741 treats the Node
engine floor as a floor and leaves concrete platform/profile choices with the
existing release/platform owner. It authorizes neither universal future Node
support nor an implicit restriction to the currently measured Linux image.

D:2743–2751 requires certification before rs-raft readiness/release for every
currently promised form that can later restart with durable coverage work.
Missing certification stops that form's candidate release; it cannot be
relabelled optional or published as a weakened replacement. v0.2.5 remains
measurement only. D:2753–2762 retains typed mismatch HOLD and durable debt;
ordinary/snapshot startup without coverage remains limited to an already
permitted mode. The existing owner, not MessageRouter, decides that mode.

The noncircular artifact/receipt composition from D:2420–2465 remains supported:
local manifest measures executable/dependencies/profile, external receipt binds
final OCI digest, and boot provenance returns one typed result before listen.
Provenance:45–88 reads local content/native facts rather than the CDC cache or a
replica census. No new startup cycle or global readiness owner is introduced.
The actual supported matrix and future candidate receipts remain prerequisite
owner work, not falsely claimed completed evidence.

### Acquisition, ACK/result and bounded progress are unchanged

D:1662–1700 still acquires complete lower then upper units before the one probe;
colocation reserves an atomic union. Bootstrap retains its 1400 KiB earmark until
all real aliases transfer. Inbound and outbound I cells remain separately
preowned, allowing opposing connection directions. The reviewed pair ordering,
K freshness, adopted C ownership and exact-ordinal retry are not altered.

D:2331–2379 retains four fixed sends and two receives per role, one Pr, bounded
Fmeta and the true send/receive/late terminals. RI:435–494 sends ACK then handler
result; RD:347/471–503 and PL:419–435/530–559 keep those ledgers distinct.
Responder completion capacity precedes ACK; legal N+1 remains possible while
an old send callback holds its slot. Credit pressure waits within the original
generation budget, then retires/drains before same-identity redrive. D19's
native assembly, old WiPending, deferred-emitter and close-fed overlaps remain
explicit. No new retry loop or raw transport/SQL path is proposed.

The fixed bank maxima remain 4792 KiB remote and 6080 KiB colocated, below 8192 KiB.
The full supported 8 MiB row remains 85 MiB; one 16 MiB+1-byte event remains
125 MiB+5 bytes below 128 MiB. A many-page backlog above 16 MiB remains distinct
from one supported large event. These are feasible design equations, not
implemented whole-process bounds. Actual adapter coefficients, refusal/progress
witnesses, native artifact certification and metadata remain source gates.

### Cumulative disposition

| Scope | Round-eleven disposition |
| --- | --- |
| Caller N1/N2, source 2de | Approved and closed; caller deadline and shared-generation deadline unchanged. |
| D1–D10 | Full captured envelope, exact ordinal/identity, Ps/Pr/H/C/K custody, K freshness, canonical digest/comparator, complete pair and atomic colocation remain supported. |
| D11–D13 | Downstream receive custody, complete-unit progress and control overlap retained; fixed counts replace cadence-derived retention. |
| D14–D20 | Dedicated listener/ordinary isolation, receiver A gate, four-out/four-in, real ACK/result and native phases retained. Superseded one-native-root premise stays withdrawn. |
| D21 | Standing48-root approach and fixed 4792/6080 KiB banks remain supported subject to explicit native/adapter certification. |
| D22 native boundary | Two nested checks and exact drain close the observed native-wrapper release defect at design scope. |
| D22 final scheduler handoff / D24 | REVISE: actual between-callback continuation retains an Immediate/list reference beyond the claimed scalar-only handoff. |
| D23 | Closed at design scope; required recovery promises preserved and existing platform owner selects concrete profiles. |
| R3-4/5/6/7 | Prior bounded publication/recovery routing/census/index approvals retained. |
| R3-1/R3-2 resource source | HOLD; normal startup, original-event delivery/lost ACK and merge acceptance remain separate. |

## Category-complete 63-item review

All 63 requested items have an evidence-backed disposition. “Supported” means
consistent at the reviewed design boundary, not that an absent source witness
already passed. D24 is the only new grouped finding; repeated references below
identify its affected categories.

### A — admission and current authority

| ID | Evidence and disposition |
| --- | --- |
| A1 | PO:32–49/117–146; D:2216–2233/2337–2344 preserve same-pool preallocation. D:2630–2647 retains native capacity through two checks. Final scheduler-record transfer before reuse remains D24. |
| A2 | D:1756–1788/1814–1834/2753–2762 keeps typed held/invalid/unknown/installed and runtime mismatch. Missing data or profile never becomes empty success. D23 supported. |
| A3 | D:89–153/2351–2352/2807 and RO:258–277/354–421 keep original caller/generation deadlines. Terminal shutdown retains resources when waiting expires; no new recovery budget. Supported. |
| A4 | RI:435–494, RD:347/471–503, PL:419–435/530–559 and D:2337–2344 preserve ACK/result shapes. D:2753–2776 makes profile result owner-supplied. Supported canonical consumers. |
| A5 | PO:62–81 and D:2366–2374 retain real release wakes. D:2633–2641 fixes native terminal; D24 requires actual scheduler-record transfer before the same synchronous wake. |
| A6 | D:1676–1700/1761–1788/2635–2637 plus CO:535–545 revalidate source/request/generation and final publication after awaits. Scheduler/profile evidence does not authorize stale coverage. Supported. |
| A7 | PO:228–245; D:2271–2276/2357–2364 preserves fixed honest held-copy diagnostics. D24's retained Immediate must not be reported gone merely because its callback is cleared. |

### Y — retry and progress

| ID | Evidence and disposition |
| --- | --- |
| Y1 | RO:354–421/522–544; D:1814–1834/2351–2355/2376–2379 retain actual same-identity redrive after old drain. Shutdown D:2704–2709 loudly retains capacity on scheduling failure. Supported. |
| Y2 | D:1692–1697/1816–1831/2624–2629 bounds semantic waiting while retaining unknown evidence/custody. Unreadable state cannot silently reset the attempt or free bytes. Supported. |
| Y3 | D:2366–2379/2693–2709 enumerates cancel/retire/timeout/bind/close/repeated shutdown. D24 corrects the remaining false final-release premise; no silent new stop. |
| Y4 | D:1662–1700/2398–2403 preserves complete ordered units and separate inbound credits. D:2753–2762 avoids profile/cache readiness cycles. No new opposite-direction or colocated progress cycle found. |
| Y5 | D:2257–2283/2331–2364/2666–2686 retains 480 KiB batch and bounded send/receive/context counts. Terminal budget can cover records, but its actual final transfer/count is D24. Actual coefficients remain gates. |
| Y6 | D:1698–1700/1814–1831/2608–2615/2702 retains exact event/page identity and one shutdown record. PL:419–435 removes successful waiter. No SQL replay or duplicate release is authorized. |
| Y7 | D:2200–2201/2351–2352/2376–2380/2807 leaves budget reset semantics unchanged. ACK, refreshed data, credit or profile cannot replenish original generation expiry. Supported. |

### T — transport and delivery

| ID | Evidence and disposition |
| --- | --- |
| T1 | RI:435–494 and D:1771–1784/2337–2344 keep delivery ACK distinct from processed result and physical callback release. No result-ACK recursion. Supported. |
| T2 | D:1785–1812/2346–2355/2366–2374 permits N+1 before old send callback and confines late input to its exact lane. D24 keeps old terminal scheduler records separate from successor authority. |
| T3 | D:1756–1788/1819–1826 and PL:184–224 retain noHandler/error/orphan/late dispositions through canonical ledgers. Profile HOLD adds no alternate response success. Supported. |
| T4 | D:1814–1834/2376–2379/2704–2709 preserves bounded unavailable/capacity waiting and explicit old-lane drain. Callback loss cannot silently free a bank or create an indefinite unowned queue. Supported. |
| T5 | D:2131–2151/2711–2718 retains native WS/both-order/colo evidence requirements. I's scheduler probe is actual Node/public APIs with a marked record, explicitly not application or transport implementation acceptance. |

### S — time and lifecycle

| ID | Evidence and disposition |
| --- | --- |
| S1 | RO:60–75/258–277 preserves injected time/unref retries. D:2630–2637 adds two bounded refed terminal checks. Timers:450–503 and I events refute post-processImmediate continuation: D24. |
| S2 | SC:263–271/371–422; D:1676–1679/2580–2585 retain leader/scope/priority. Runtime profile and terminal checks confer no Raft or row authority. Supported. |
| S3 | D:2608–2629/2693–2702 keys idempotent drain by boot/listener generation and covers startup/restart phases. Native retention is fixed; final residual scheduler handoff remains D24. |
| S4 | D:2366–2379/2628–2629 retains accepted callback/consumer/debt obligations after deadline. Legal lag cannot be reclaimed by TTL; separate shutdown pressure stays explicit. Supported. |
| S5 | AR:511–516/SC:263–271 and D:2753–2762 preserve recovery with ordinary mutation admission closed. Local byte verification does not wait for the cache it helps recover. D23 supported. |

### R — recovery and publication

| ID | Evidence and disposition |
| --- | --- |
| R1 | CO:395–445/494–545 and D:618–708/2089 retain row/suffix/tombstone/revision and final cache fences. D22/D23 changes no publication or ACK convergence owner. Supported. |
| R2 | D:1644–1660/1785–1788/2608–2615/2635–2637 preserves exact boot/listener/lane identity. D24 addresses retained scheduler custody rather than permitting stale generation mutation. |
| R3 | D:216–225/774–795/1698–1700 keeps complete coverage and final/next boundaries. Socket/profile/budget success cannot certify an empty or partial source response. Supported. |
| R4 | D:553–614/677–708/1814–1831 preserves same-N replay/conflict and original event identity. Two terminal checks do not recreate SQL or durable obligations. Supported. |
| R5 | D:1816–1831/2753–2776 retains unavailable/uncertified as owed debt. D23 explicitly prevents a supported required recovery path being qualified as optional or incomplete. Closed at design scope. |

### C — concurrency and custody

| ID | Evidence and disposition |
| --- | --- |
| C1 | D:2227–2233/2337–2355 claims before native/send/parse allocation. D:2630–2682 preowns both barrier records. D24 corrects actual post-callback bookkeeping handoff before release. |
| C2 | D:935–938/1428–1436/1761–1788/2635–2647 requires current authority at request/result and final drain. A promise continuation is not proof of whole scheduler unwind: D24. |
| C3 | D:1594–1618/1698–1700/2608–2615/2702 gives one shutdown record and once-only claim/result/release winner. Future source must enforce it in existing Shutdown; no current-source approval inferred. |
| C4 | PO:62–81 wakes synchronously; D:2687–2709/2794 must keep terminal state and ownership installed before wake. I probe shows remaining scheduler reentrancy boundary: D24, one combined finding. |
| C5 | D:2216–2233/2331–2335/2608–2615 scopes real node pool, directional lanes and boot/listener generation. No remote scalar substitutes for local receive credit. Residual local records require explicit custody under D24. |

### F — production flow and compatibility

| ID | Evidence and disposition |
| --- | --- |
| F1 | CT→RO/RC→AR→SC/ST→RI/RD/PL→FC→CO retained. D:2720–2776 binds Release/Provenance/Ports/Server/Shutdown through existing owners. No raw local read or second publication owner. Supported inventory. |
| F2 | RO:354–421/522–544 and D:1814–1834/2376–2379 keep wake/redrive independent of new writes and unhydrated cache. Provenance:45–88 consumes local facts. No new dependency cycle found. |
| F3 | D:89–153/2584–2585/2807 preserves approved caller 2de and fixed shared generation. No new caller-source behavior or reopening. Retained approval. |
| F4 | D:2384–2416/2666–2686 retains remote/colo bank and 85 MiB/125 MiB+5 B whole equations. D24 requires final small-record custody, not a larger payload budget. Supported-case and actual memory source gates remain. |
| F5 | D:2521–2525/2743–2762 prohibits pool/row expansion, SQL rerun, ordinary/snapshot borrowing and force-readiness. D23 now expressly forbids recovery downgrade to pass this candidate. Supported. |

### H — evidence and harness fidelity

| ID | Evidence and disposition |
| --- | --- |
| H1 | Prior I10 native red/control and current I/immediate-unwind-result.json target different exact mechanisms. New red is a retained scheduler object at the stated release point, not a missing adapter or setup/import failure. |
| H2 | I probe uses exact production Node and real timers/heap with public APIs; only a record marker and companion callback are injected. Application/WS/candidate certification ceilings are explicit. |
| H3 | I events/stack separately order callback return, awaited continuation, companion callback and following check. D:2711–2718 retains native first/second distinction; source Timers:450–503 corroborates timing. |
| H4 | D:1761–1788/2357–2364/2608–2615/2771–2774 retains full endpoint/generation/ordinal and profile identities. Diagnostic executable and official timers source fingerprints are exact. |
| H5 | D:2133–2151/2408–2416 keeps nonempty large-event/refusal/replay controls. I diagnostic shows one marked live Immediate followed by absence; prior actual native wrapper control remains unchanged. |
| H6 | ce9e/0d725/7aef/8188/576b exact chain and 34+4 owner checks recorded; all 18 prior diagnostics unchanged. Docs-only verdict is separate from adapter/runtime/startup/durable-delivery/merge acceptance. |

### O — owner interactions

| ID | Evidence and disposition |
| --- | --- |
| O1 | D:2227–2233/2323–2325/2608–2615/2722–2724 retains PO resource, RO retry, router shutdown, Node scheduler and Release/Provenance ownership. D24 requires actual residual custody within those owners. |
| O2 | D:1743–1788/2337–2374 preserves real ACK/result consumer shapes; D:2638–2691's final scheduler handoff is incomplete for the actual Immediate/list population: D24. |
| O3 | D:2131–2151/2711–2718 requires refusal and supported recovery cumulatively. D24 has a same-runtime red/control; future unimplemented source tests are not a design rejection by themselves. |
| O4 | D:1814–1831/2376–2379 keeps stale→fresh exact-identity reentry after old drain. D:2753–2776 keeps mismatch HOLD and successful future certification through its owner. D24 disallows old completion affecting new generation. |
| O5 | D:2331–2364/2376–2403 preserves preowned bank backpressure and prevents cadence-amplified retained buffers. D:2666–2686 has terminal headroom but must transfer actual records under D24. No limit increase requested. |
| O6 | PO:62–81/RO:522–544 connects releases to the existing wake. D24 requires final ownership/state before synchronous release, without inventing a new timer or competing wake owner. |
| O7 | D:2604–2606 correctly rejects server/Socket/async-hook projections as native release authority. D:2658–2662 still treats awaited continuation as whole-list terminal despite retained evidence: D24. |
| O8 | I/navigation.json and diagnostic manifest bind exact subject/delta/source/executable. Retained native positive proof is separate from new scheduler red; no inference that v0.2.5 certifies the future release. |
| O9 | Reviewed Timers/Env/Async, actual PO synchronous wake, Shutdown drain, RI/RD/PL and runtime-profile consumers. The sole remaining finding is D24; no new payload, protocol, fallback or profile-policy defect established. |
| O10 | Registry:894–942/1797–1860 and D:2131–2151/2711–2718 retain transport/cache/reconcile and runtime/listener witness metadata requirements. The scheduler interaction witness belongs with future source registration; metadata not approved here. |

### J — JavaScript and byte domains

| ID | Evidence and disposition |
| --- | --- |
| J1 | D:2257–2265/2384–2411/2666–2676 uses bounded safe integer sums; canonical length/count/port guards D:228–275 retained. D24 is lifetime accounting, not arithmetic overflow. |
| J2 | JSON:109–174 and D:228–250/1761–1788 preserve own captured primitive wire data. Profile/terminal results come from their owners, never inherited evidence or a request override. Supported. |
| J3 | D:2318–2325 retains capture-once measurement and exact aliases. Timers:488–503 clears the callback but retains the Immediate/list at I's continuation. D24 requires counting those actual roots until transfer/terminal. |
| J4 | Domain/JSON prototype defenses and D:1866–1873 trusted-host discipline unchanged. I probe does not monkey-patch runtime/intrinsics or retain arbitrary hostile callbacks. No threat-model expansion. |
| J5 | D:2270–2276/2357–2364 bounds scalar diagnostics, control errors and identity. D:2685's numeric-only residual is insufficient for the observed object/link: D24; future coefficient fitting remains separate. |
| J6 | D:2734–2741 assigns concrete supported profiles to the existing platform owner without universal future Node/OS claims. The exact cited timers bytes were verified; their actual microtask semantics must be reflected by D24. |
| J7 | D:618–633/677–708 retains NUL/escaping and canonical digest/nonallocating comparator. D22/D23 changes no encoding. Artifact hashes identify evidence, not data publication or memory release authority. |
| J8 | D:2216–2283/2331–2364 bounds individual/aggregate/native/page populations. D:2666–2686 budgets terminal metadata but omits its actual surviving-record handoff; D24. No all-data materialization or new resource cap is approved. |

## Completion

`I/commands-and-results.md` records the exact scheduler command and the scope of
its evidence. `I/diagnostic-sha256.txt` freezes the script, results, snapshots,
subject/delta, navigation and official timers source. No source files were
modified to produce the mechanism counterexample.

All 63 items have concrete dispositions. **D24 is the complete remaining findings
batch.** Preserve the corrected native two-check boundary, the closed D23
profile-policy clause, caller 2de and previously accepted resource/protocol
controls. Complete the finite final scheduler-record handoff in the existing
owners; do not add an endless sequence of timing barriers or declare the
retained records unowned. Resource source and broader recovery/merge acceptance
remain HOLD under their existing gates.
