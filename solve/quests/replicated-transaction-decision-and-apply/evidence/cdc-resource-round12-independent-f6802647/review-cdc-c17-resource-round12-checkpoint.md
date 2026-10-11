# C17 whole resource handoff: round-twelve design review

Date: 2026-10-12. Independent reviewer:
`subagent:/root/review_checkpoint_composition`.

## Scoped verdict

**APPROVE DESIGN ONLY** at
`b4b0294f4e91f09773f708e5e006c936c9617129e550dcfa2707032d07c76269`.

**D24 is closed at design scope.** The existing transfer owner continuously
retains the 16 KiB terminal reserve across listener generations. It returns
only listener capacity, after terminalizing the old operation, consuming its
release capability and recording the actual residual scheduler custody. A
synchronous wake can start a successor without making the old scheduler records
unowned or allowing them to release the successor. No further timing barrier
or competing owner is introduced.

No additional blocking design finding was established in this complete
63-item round. One **nonblocking provenance typo** is recorded below: D:2815
truncates the prior report hash by its final hexadecimal digit. The actual
report, predecessor, delta and diagnostic chain were independently verified;
this report supplies the exact missing identity.

Preserve the previously supported D22 native close boundary, closed D23
required-profile policy, complete-pair/fixed-bank/ACK/receive controls, and
caller source approval `2de419483c9b4ce9e3fabc87bb54d93e4afb8817`.

**Resource SOURCE remains HOLD.** This approval establishes an executable
resource/lifetime contract, not measured adapter coefficients or an implemented
transfer-owner mutation. Runtime artifact/layout prerequisites, exact source
review, cumulative native/transport/cache witnesses, test metadata, normal
startup, original-event CDC delivery/lost ACK and merge acceptance remain open.
No current production source, runtime/release policy, deployment or publication
is approved here.

Only this report and diagnostics under `I` were written. No product source,
test source, design, Quest, index, commit or remote was changed. One small native
scheduler diagnostic was run; no cluster or application acceptance test ran.

## Exact subjects and evidence

`C` = `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.

`E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.

`D` = `C/solve/quests/replicated-transaction-decision-and-apply/cdc-coverage-response-resource-handoff-amendment-20261011.md`.

`I` = `E/cdc-c17-round12-review`; `I11` = `E/cdc-c17-round11-review`;
`I10` = `E/cdc-c17-round10-review`.

`P` = `C/solve/quests/replicated-transaction-decision-and-apply/evidence/cdc-runtime-allocation-certification-20261011T2100`.

`N` = `P/node-v22.22.0-libuv-v1.51.0`.

| Artifact | Independently verified identity |
| --- | --- |
| D, 3004 lines / 197829 bytes; `I/subject-b4b0294f.md` | SHA-256 `b4b0294f4e91f09773f708e5e006c936c9617129e550dcfa2707032d07c76269` |
| Predecessor, 2807 lines / 184960 bytes | SHA-256 `ce9e463cdfa829c1e5fd83ec49bde87fca0258d615b87b72582b46048ce23201`; complete exact prefix |
| New 197-line delta, `I/delta-d24.md` | SHA-256 `e4e66cc2b8c5d5f03db5df2f421adbe898796c7c706c544a6986d10ffdaa1650` |
| Actual round-eleven report | SHA-256 `24c5c10ad6a0cd4ef9f39b8637b9e1777a6b9a70f0b24d40d1d4fe370c0797d7` |
| I11/diagnostic-sha256.txt | SHA-256 `a2d93b3c6a7b22467974445ac2d559b7d1fc6f02b276dbf167cf46d5ac029585`; all 11 entries unchanged |
| I/navigation.json | SHA-256 `1885554c4e2c765c1856efea5b7aa4e57a1439faf380cbc598395637d54de326` |
| Retained official Node v22.22.0 timers source | SHA-256 `c0cb11238d8f10aba653926c9c0ee28aa7f49593100de7f013ffd61b9fa45c42` |
| Actual diagnostic executable | SHA-256 `1bec56ef7cfa9a76f3e0b7c0a87f220eb73f23102b9c0b4c7529a3f7c3ce7c31`; Node 22.22.0 / V8 12.4.254.21-node.33 / libuv 1.51.0, Linux x64 |

All 34 application/deployment navigation paths still match the prior round and
pinned `0e9a07604b5e29f0f686db3e567333c7775934df`. Additional lifecycle and
ordinary scheduler consumers were read and copied under `I/source/` with exact
hashes. The full new section and the unchanged cumulative prefix were examined.
The diagnostic executable remains v0.2.5 measurement evidence, not the future
rs-raft candidate or completed executable-to-source attestation.

### Reference key

| Key | Concrete path |
| --- | --- |
| Timers | `I11/native/timers.js`, official `https://raw.githubusercontent.com/nodejs/node/v22.22.0/lib/internal/timers.js` |
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
| CdcLife / PartitionLife | `I/source/src/cdc/cdc-integration-service-lifecycle.js`; `I/source/src/partition/partition-service-lifecycle-methods.js` |
| Seed / Bootstrap / Planner | `I/source/src/bootstrap/bootstrap-service-seed-workflow.js`; `bootstrap-service-runtime-methods.js`; `I/source/src/control-plane/readiness-planning-version-contract.js` |

The repository rules/router and the same ten verification templates govern the
63-item union. Existing strict wire-data, trusted host/private network and
supported-platform boundaries are preserved. The review does not invent a
requirement to tolerate arbitrary retention or mutation by an unrelated hostile
JavaScript host.

## Complete findings batch

### P1 — nonblocking prior-report hash typo

D:2815 quotes the round-eleven report hash as
`24c5c10ad6a0cd4ef9f39b8637b9e1777a6b9a70f0b24d40d1d4fe370c0797d`,
which has 63 hexadecimal digits. The exact 64-digit hash is
`24c5c10ad6a0cd4ef9f39b8637b9e1777a6b9a70f0b24d40d1d4fe370c0797d7`.

The named report exists and was rehashed; predecessor/delta and diagnostic
manifest identities agree. Therefore this is a traceability typo, not ambiguity
about the reviewed bytes or a blocking resource-contract defect. Correct it
through the next authorized evidence/document update, citing this erratum;
no source behavior or verdict scope changes. The reviewer did not edit D.

No blocking design finding remains in this round.

## Whole-interaction reasoning

### 1. One continuously owned terminal reserve, not a late free

D:2871–2895 divides the existing 16 MiB Wbase into:

    Rterminal =       16384 bytes, continuously retained
    Wlistener =    16760832 bytes, returned per listener generation
    total     =    16777216 bytes

The first activation acquires the sum atomically. A later generation acquires
only Wlistener; the same terminal reserve persists. It has no TTL or between-
generation free operation, consumes no root-session identity, and supplies no
wake even when endpoints disappear. It remains within the same 128 MiB pool and
same node budget owner. Process/Node Environment teardown reclaims it without
an in-process capacity notification.

That directly resolves D24: the second Immediate and its links may remain
reachable after Wlistener return. Their credit never became free. The design
no longer infers memory reclamation from callback return, a promise reaction,
server close or async-hooks notification.

The existing ownership surface is concrete: PO:14–49 has a node-shared pool
keyed through `nodePoolKey`, and PO:84–102 gives endpoints ownership within it.
**The source change must preserve that same pool across an endpoint-free
interval.** PO:209–225 currently retires endpoint sessions and deletes an empty
pool. D:2891–2895 explicitly supersedes using that deletion as a terminal-reserve
release. The later implementation must keep the infrastructure claim under the
canonical pool even when endpointCount/sessionCount are zero, rather than
creating a replacement budget that forgets it. CdcLife:48/70/193 and
PartitionLife:155 are real retirement callers to cover. This is an explicit
source obligation of the proposed lifecycle change, not an unmentioned design
requirement or a claim that current code already meets it.

The reserve is once per existing node-pool lifetime, not once per endpoint,
partition, listener generation or caller. The existing pool key must remain the
source of that identity. This review does not substitute a new global pool or
assume that distinct logical nodes in a host share one existing node budget.

### 2. Finite overlap and the actual scheduler boundary

D:2900–2917 budgets at most two coverage Immediate records, two internal
shutdown generation/completion records, and one bounded alias/destroy/handoff
set. At the problematic checkpoint, old second-check custody can coexist with
one new first check queued by a synchronous release wake. The new first cannot
execute in the running immediate list. It enters only after that list has
finished; then the owner changes the bank's generation before allocating the
new nested second check.

Timers:437–448 separates new immediates from the current list;450–503 explains
the between-callback promise checkpoint and actual previous/current references.
The next generation's check therefore supplies the needed existing phase fact
without a third callback. Native destroy IDs use Async:564–587 and
Env:1571–1588; the selected profile must retain that ordering and coefficient
proof. If no successor arrives, the conservative fixed descriptor can remain
indefinitely without accumulating history, withholding a root session or
scheduling work.

A bounded new diagnostic, `I/successor-record-probe.cjs`, exercised three
successive generations on the exact retained Node executable. Each second
callback has an ordinary companion. Each continuation synchronously starts
and immediately schedules shutdown of the successor, matching the native
ordering of the proposed release wake. This diagnostic does **not** implement
or certify the future transfer-owner compare-and-transfer operation.

`I/successor-record-results.json` reports marked live Immediate records:

| Checkpoint | Marked coverage records |
| --- | --- |
| generation1 first-check entry | `1:first` |
| generation1 continuation, successor queued | `1:second`, `2:first` |
| generation2 first-check entry | `2:first` |
| generation2 continuation, successor queued | `2:second`, `3:first` |
| generation3 first-check entry | `3:first` |
| final control | none |

This demonstrates feasibility of the proposed two-record overlap through real
scheduler checkpoints. It is not a measured 4/8/4 KiB coefficient, a general
proof over future closures or an implemented concurrency gate. Instrumented
self sizes vary between 104 and 136 bytes and are deliberately not used as
production constants. The future source still must census its exact retained
closures, Promise/reaction graph and aliases inside each stated subdivision.

Repeated shutdown calls must return/join the same internal generation record;
they cannot allocate new internal records charged as if they were absent. A
third generation cannot reach its checks while the successor owns Wlistener.
External callers may retain the fixed settled result through their ordinary
call contract, but the handed-off result must contain no transport graph,
release token or successor authority (D:2946–2953). These are enforceable
contract requirements; their source implementation remains unapproved.

### 3. Transitive links and independent ordinary ownership

D:2836–2867 correctly identifies the residual graph. The old coverage record's
own pointer field is charged with that record. The ordinary companion and
remaining ordinary list are independently retained by Node's current-list/
current-immediate roots at the observed checkpoint. Merely having an additional
link to those already-owned nodes does not allocate a second copy of their
payload or transfer their semantic custody to CDC.

This attribution is valid only with the promised fixed descriptor and actual
handoff discipline: **the reserve must not itself retain an ordinary list or
transport graph after its independent owner would release it.** D:2936–2941/
2950–2963 keeps the descriptor to terminal identity/category/count facts while
Node/MessageRouter retain physical references. The later census must verify
that its closures and descriptor follow that contract, including any real
backlinks or captures; the approval is not permission to count a newly retained
graph as merely one pointer.

Adjacent real consumers were checked. Seed:154–183 clears its stored ordinary
Immediate handle at callback entry; Bootstrap:395–409 clears a pending deferred
handle on shutdown. CN:366 and the ordinary yield helpers schedule callbacks
without retaining fired Immediate handles as transfer authority. Planner:173–
175 supplies the existing macrotask scheduler. No concrete current consumer
was found to require the terminal reserve to own an independently retained
unbounded ordinary list. Arbitrary external handle retention is not silently
certified by this scoped design review; actual future source captures remain
part of the named coefficient/lifetime witness.

### 4. Exact terminal transition precedes synchronous wake

D:2928–2953 supplies one compare-and-transfer operation under PO:

1. Match boot, listener generation, Wbase claim and shutdown record.
2. Install `terminal-transferred`, consume the sole listener-release capability
   and replace exposed resource pointers with the fixed terminal result.
3. Record the residual categories/counts in continuously held Rterminal.
4. Return exactly Wlistener bytes.
5. Invoke the existing wakes.

This matches PO:62–81's real synchronous wake boundary. A wake can observe only
the installed terminal state, cannot reuse the consumed token and must acquire
its own listener generation. The old continuation performs no pool/generation
mutation after wake. An identity/count/byte failure retains Wlistener and emits
no wake (D:2965–2968). Thus refusal and valid successor progress occur through
one owner mutation; no observer reconstructs release authority from timers.

The future implementation must supply the actual CAS and token stripping; the
scheduler diagnostic does not fake that source proof. Required witnesses are
already concrete in D:2992–2998: synchronous start/stop successor, old/stale
release refusal, count/byte occupancy and exact once return. A normal native
callback does not authorize a substitute physical generation.

### 5. Cumulative payload, protocol, profile and resource boundaries

The accepted D22 two-check boundary still follows exact A/I/HTTP/ws/ledger/send/
emitter drain and crosses native close before the second check. I10's native
first/second-control evidence remains unchanged. D23 still preserves every
currently promised recovery-capable delivery form, selects concrete profiles
through existing release/platform authority and holds on mismatch. No mode is
made optional to qualify this candidate, and v0.2.5 remains measurement only.

Complete lower/upper units precede the one exact probe (D:1662–1700); colocation
uses one atomic union. Ps/Pr/H/C/K and bootstrap custody, K freshness and adopted
C ownership remain distinct. The4-out/4-in allocation, real ACK/result ledgers,
valid N+1 before old send callback, uncertain retire/drain/redrive, D19 native
assembly/downstream/close phases and original deadlines are unchanged.

Rterminal is a split of existing capacity, not an extra 16 KiB. Full arithmetic
remains 85 MiB for an 8 MiB row and 125 MiB+5 bytes for one 16 MiB+1-byte event,
including Wbase and the entire fixed 8 MiB term. A many-page backlog above 16 MiB
still uses bounded pages. The standing 480 KiB native maximum, remote 4792 KiB
bank and colocated 6080 KiB bank stay inside their existing reservations.

The profile-specific native/layout/allocator caps remain prerequisites; the
future adapter's Aactive/Mlane/Gc/Bsend/Frecv/Fmeta/S/H/C/K and terminal 4/8/4 KiB
coefficients remain source-measurement gates. Coherent admission arithmetic
is not whole-process/RSS proof or production recovery acceptance.

## Cumulative dispositions

| Scope | Current disposition |
| --- | --- |
| N1/N2 caller source 2de | Approved and closed; original per-caller and shared-generation deadlines unchanged. |
| D1–D10 | Captured full envelope, exact identity/ordinal, Ps/Pr/H/C/K custody, canonical comparator/digest, complete pair and atomic colocation retained. |
| D11–D13 | Downstream receive custody, complete-unit progress, control overlap and bounded fixed populations retained. |
| D14–D20 | Dedicated listener/ordinary isolation, receiver A gate, directional I population, real ACK/result and native phases retained; false one-root premise stays superseded. |
| D21 | Standing48-root strategy and fixed 4792/6080 KiB banks supported; native/adapter certification remains required. |
| D22 | Native close boundary remains supported; no extra barrier added. |
| D23 | Required delivery/recovery promises remain preserved; existing platform owner chooses concrete profiles. |
| D24 | Closed at design scope by persistent terminal debit and ordered exact terminal transfer before Wlistener return/wake. |
| R3-4/5/6/7 | Prior bounded publication/recovery routing/census/index approvals retained. |
| R3-1/R3-2 resource source | HOLD pending exact implementation/certification and cumulative witnesses. |

## Category-complete 63-item review

Every requested item has concrete evidence and a disposition. All 63 apply;
none is discarded as irrelevant merely because this is a design review.
“Supported” is design consistency, not a claim that future source tests passed.

### A — admission and current authority

| ID | Evidence and disposition |
| --- | --- |
| A1 | PO:32–49/117–146; D:2871–2895/2931–2944 retains the same measured pool, atomically acquires Wbase and never frees Rterminal. Supported; exact source infrastructure debit remains required. |
| A2 | D:1756–1788/1814–1834/2753–2762/2965–2968 retains held/invalid/unknown/installed and profile-mismatch distinctions. Failed terminal transfer keeps listener capacity; no empty success. Supported. |
| A3 | D:89–153/2351–2352/2831–2832 and RO:258–277/354–421 preserve original caller/generation deadlines through all waits. Node-lifetime reserve is custody, not a renewed operation budget. Supported. |
| A4 | RI:435–494, RD:347/471–503, PL:419–435/530–559 retain ACK/result consumers. D:2934–2938 supplies a fixed terminal result after token consumption, not an alternate release predicate. Supported. |
| A5 | PO:62–81; D:2942–2944/2955–2963 ties wake to real Wlistener return; Rterminal descriptor turnover never wakes. Source-order interaction is explicit. Supported. |
| A6 | D:1676–1700/1761–1788/2635–2637/2934–2938 and CO:535–545 retain current request/source/generation and final publication authority. Late callback cannot release a successor. Supported. |
| A7 | PO:228–245; D:2900–2905/2939–2941/2992–2996 names actual terminal categories/counts instead of declaring records gone. Infrastructure held-byte diagnostics must survive endpoint retirement in source. Supported contract. |

### Y — retry and progress

| ID | Evidence and disposition |
| --- | --- |
| Y1 | RO:354–421/522–544; D:1814–1834/2376–2379/2944–2949 uses existing release wake and recovery cadence. No retry is suppressed by a fabricated free/terminal marker. Supported. |
| Y2 | D:1692–1697/1816–1831/2624–2629/2965–2968 retains unknown evidence/custody when waiting is spent. The standing reserve requires no unreadable-row polling. Supported. |
| Y3 | D:2366–2379/2693–2709/2965–2968 gives explicit error, timeout, stale-identity and shutdown outcomes; process teardown does not emit an in-process free. Supported. |
| Y4 | D:1662–1700/2398–2403 retains ordered complete units and independent inbound capacity. D:2907–2917 allows finite successor overlap without another timer or mutual hold. I native schedule corroborates feasibility. |
| Y5 | D:2331–2364/2900–2924 bounds roots, bytes, Immediate/completion counts and aliases. No per-generation terminal history grows; exact 4/8/4 KiB coefficients remain source gates. Supported. |
| Y6 | D:1698–1700/1814–1831/2934–2953 consumes the old release token once and preserves same event/page identity. Repeated shutdown shares one record; stale duplicate transfer refuses. Supported. |
| Y7 | D:2200–2201/2351–2352/2376–2380 keeps cadence independent of physical population. Neither ACK, profile, returned listener bytes nor permanent terminal debit renews the original budget. Supported. |

### T — transport and delivery

| ID | Evidence and disposition |
| --- | --- |
| T1 | RI:435–494; D:1771–1784/2337–2344 retains delivery ACK versus processed result and physical callback custody. Rterminal changes no wire settlement. Supported. |
| T2 | D:1785–1812/2346–2355/2934–2953 permits valid N+1 under old callback lag while preventing old terminal token use against the successor. Exact identities remain. Supported. |
| T3 | D:1756–1788/1819–1826 and PL:184–224 retain canonical noHandler/error/late/orphan mapping; shutdown transfer produces a fixed local terminal result without fallback success. Supported. |
| T4 | D:1814–1834/2376–2379/2965–2968 preserves bounded unavailable/capacity waits and truthful retained custody. Missing callback cannot allocate an unbounded queue or release Rterminal. Supported. |
| T5 | D:2131–2151/2711–2718/2992–2998 retains real WS, native, both-order/colo and synchronous wake witnesses. I's real-timers probe has a stated non-application scope; source execution remains required. |

### S — time and lifecycle

| ID | Evidence and disposition |
| --- | --- |
| S1 | RO:60–75/258–277 retains injected clocks/unref retry timers. D:2630–2637 keeps two refed checks; D:2955–2963 adds no polling/barrier. Standing reserve lifetime does not keep the event loop alive. Supported. |
| S2 | SC:263–271/371–422 and D:1676–1679/2828–2832 keep leader/scope/priority. Scheduler phase or budget availability never grants row, Raft or activation authority. Supported. |
| S3 | D:2871–2895/2934–2953 retains infrastructure across endpoint-free/restart intervals and binds listener generations. PO:209–225 deletion behavior must be adapted by the later source under the same owner. Supported design, source absent. |
| S4 | D:2366–2379/2628–2629/2884–2895 forbids deadline-only release of externally retained copies and of the terminal reserve. Legal operation delay keeps truthful ownership. Supported. |
| S5 | AR:511–516/SC:263–271 and D:2753–2762 retain recovery while ordinary mutation admission is fenced. Local profile verification does not require the cache it helps recover. No new global barrier. Supported. |

### R — recovery and publication

| ID | Evidence and disposition |
| --- | --- |
| R1 | CO:395–445/494–545 and D:618–708/2089 retain row/suffix/tombstone/revision and cache publication fences. Terminal infrastructure debit changes no committed/acknowledged state. Supported. |
| R2 | D:1644–1660/1785–1788/2934–2953 keeps exact boot/listener/claim identity through retirement and successor. Old record is terminal before wake; it has no successor authority afterward. Supported. |
| R3 | D:216–225/774–795/1698–1700 preserves complete coverage and exact final/next boundaries. Capacity/profile/terminal success cannot turn malformed or partial data into empty success. Supported. |
| R4 | D:553–614/677–708/1814–1831 preserves same-N replay/conflict and original event recovery without SQL rerun. Wlistener release is idempotent under exact claim comparison. Supported. |
| R5 | D:1816–1831/2753–2776/2965–2968 retains unavailable/mismatch/stale transfer as pending debt or retained ownership. Absence of an endpoint/waiter does not prove Rterminal free. Supported. |

### C — concurrency and custody

| ID | Evidence and disposition |
| --- | --- |
| C1 | D:2227–2233/2337–2355/2884–2889 claims before allocation and D:2931–2944 installs custody before synchronous wake. No free interval is left by the final handoff. Supported. |
| C2 | D:935–938/1428–1436/1761–1788/2934–2938 requires current identity at handoff and final mutation. The observed between-callback checkpoint is explicitly permitted by D:2928–2930. Supported. |
| C3 | D:2608–2615/2702/2934–2943 gives one generation record and one consumed listener-release token. Third-generation checks cannot enter while the successor owns Wlistener. Supported contract. |
| C4 | PO:62–81 synchronous wake is matched by D:2936–2950's terminalize/consume/record/subtract/wake order. Old continuation makes no later pool/generation mutation. I probe exercises corresponding native successor ordering; CAS proof remains future. |
| C5 | PO:32–49; D:2871–2895 scopes permanent terminal debit to the canonical node pool, not each endpoint or session. Wlistener is generation-scoped; no new unrelated budget owner. Supported. |

### F — production flow and compatibility

| ID | Evidence and disposition |
| --- | --- |
| F1 | CT→RO/RC→AR→SC/ST→RI/RD/PL→FC→CO remains the chain. D:2931–2944 assigns final resource mutation to PO and MessageRouter shutdown. CdcLife/PartitionLife retirement consumers are explicitly inventoried. Supported. |
| F2 | RO:354–421/522–544 and D:1814–1834/2376–2379 retain recovery without new writes or cache readiness. Rterminal adds neither work nor a wake loop. Supported. |
| F3 | D:89–153/2831–2832/3003–3004 leaves caller 2de and its fixed shared generation closed. No caller-source re-review or broader caller promise inferred. Retained approval. |
| F4 | D:2876–2882/2983–2988 and I/navigation.json preserve 16 MiB total infrastructure, 85 MiB small-row and 125 MiB+5 B large-event equations. Backlog and single large event remain separate source witnesses. Supported feasibility. |
| F5 | D:3000–3004/2743–2762 preserves no raw fallback, SQL rerun, extra scheduler, pool increase, ordinary/snapshot borrowing or recovery downgrade. Supported. |

### H — evidence and harness fidelity

| ID | Evidence and disposition |
| --- | --- |
| H1 | I11 immediate-unwind red remains valid; D:2836–2867 accepts its real residual instead of erasing the witness. I/successor-record-results.json tests the correction's native overlap, not a fake source validator. Supported evidence chain. |
| H2 | I native probe uses unchanged exact Node, public scheduling and snapshots with diagnostic markers. No transfer-owner CAS is simulated or certified. Actual application/WS/native coefficient ceilings remain explicit. |
| H3 | I/successor-events.json separately orders second callback, continuation, ordinary companion and successor first check over three generations. No compressed deadline or inferred remote callback ordering. Supported native feasibility. |
| H4 | D:1761–1788/2357–2364/2934–2941 retains full source/request/boot/listener/claim identity and actual categories. Exact design/source/executable hashes are in I/navigation.json. P1 corrects the prior-report typo. |
| H5 | D:2133–2151/2408–2416/2992–2998 preserves nonempty supported boundaries, refusal/replay and successor controls. I shows actual two-record overlap followed by one and then zero; no empty-work acceptance substitute. |
| H6 | Exact b4b/ce9e/e4e/24c5/a2d chain, 34 source matches and 11 retained diagnostics verified. Design-only approval, native feasibility, source implementation and production recovery are separately scoped. |

### O — owner interactions

| ID | Evidence and disposition |
| --- | --- |
| O1 | D:2859–2867 assigns Node physical scheduler custody, MessageRouter completion and PO budget/release authority. No projection or new store competes with those owners. Supported. |
| O2 | D:2928–2953 defines one typed exact compare-and-transfer including terminal result and consumed token through real shutdown/PO consumers. Rterminal continuously covers residual physical references. Supported contract. |
| O3 | D:2992–2998 requires source refusal plus legitimate synchronous successor progress with prior native/transport/cache controls. I corroborates scheduler feasibility without pretending missing source tests passed. Supported cumulative bar. |
| O4 | D:2934–2968 admits fresh exact successor claims after old terminal transfer and rejects stale replay. New first check advances conservative descriptor without capacity wake or permanent stale veto. Supported. |
| O5 | D:2331–2364/2871–2895/2900–2924 keeps bounded wire and terminal populations, no per-retry/history accumulation or borrowed credits. Actual byte subdivisions remain source gates. Supported. |
| O6 | PO:62–81 and D:2942–2963 tie wake to only Wlistener return; descriptor turnover and process reclamation do not emit fake release events. Existing RO retry remains sole owner. Supported. |
| O7 | D:2823–2828/2928–2930/2965–2968 withdraws the false post-processImmediate premise. Neither cleared callback nor timer phase grants capacity; the owned exact transfer does. Supported D24 closure. |
| O8 | I/navigation.json binds subject/prefix/delta/prior/native identities; exact diagnostic populations remain separate from byte cap certification. P1 is a recorded nonblocking citation typo with the true prior hash supplied. |
| O9 | Reviewed PO lifecycle/wakes, retirement callers, real ordinary scheduler consumers, Timers/Env and existing RI/RD/PL. No alternate release, raw read or added retry path is proposed. No new blocking interaction finding found. |
| O10 | Registry:894–942/1797–1860 and D:2131–2151/2711–2718/2992–2998 retain complete registered resource/transport/cache witnesses. Pool endpoint-free lifetime and synchronous successor must be covered when source/metadata land. No metadata approval now. |

### J — JavaScript and byte domains

| ID | Evidence and disposition |
| --- | --- |
| J1 | D:2876–2882/2900–2905 and I/navigation.json keep safe exact byte subtraction and count ceilings; canonical numeric/port domains D:228–275 retained. No -0/nonfinite/overflow shortcut. Supported. |
| J2 | JSON:109–174 and D:228–250/1761–1788 retain own canonical primitive wire fields. D:2934–2938 consumes exact owner identity, not caller-supplied release authority. Supported. |
| J3 | D:2318–2325/2836–2867/2939–2941 charges actual captured aliases/records; independent ordinary ownership does not duplicate bytes. Source must verify descriptor/closures do not extend an ordinary graph's lifetime. Supported contract. |
| J4 | Domain/JSON defenses and D:1866–1873 trusted producer boundary unchanged. Native probes do not monkey-patch scheduler/intrinsics. No arbitrary hostile-handle-retention claim is added. Supported scope. |
| J5 | D:2900–2924/2936–2953 bounds primitive terminal descriptors and strips transport/release pointers before external handoff. Two/two internal population is explicit; external fixed settled results carry no authority. Supported. |
| J6 | D:2734–2741 preserves concrete profiles under existing platform authority. Exact native scheduling is tied to the selected artifact; future Node/OS universality is not inferred. Supported. |
| J7 | D:618–633/677–708 preserves canonical digest, NUL/escaping accounting and nonallocating comparator. Terminal reserve changes no encoding or data authority. Real copies and aliases remain separately attributed. Supported. |
| J8 | D:2216–2283/2331–2364/2900–2924 bounds individual/aggregate/native/terminal populations. Permanent reserve has constant descriptor state and no producer history. Later source must enforce full 4/8/4 KiB and S/H/C/K limits. Supported design; source HOLD. |

## Source gates and completion

The accepted design must be implemented and reviewed through the existing
owners. In particular:

1. Preserve one Rterminal debit in the canonical pool across zero endpoints,
   lifecycle retirement and listener restart; do not reset it in a replacement
   pool or represent it as a TTL/root session.
2. Implement the exact ordered terminal transfer with consumed old capability,
   stripped resource pointers, truthful diagnostics and synchronous wake safety.
3. Census the actual Immediate/closure/Promise/alias/destroy graph under the
   selected artifact. The 4/8/4 KiB subdivisions and aggregate 16 KiB must all hold;
   this review does not supply guessed coefficients.
4. Run the cumulative native, real WS, both-order/colo, exact/below-capacity,
   large-event/backlog, replay/conflict/suffix and startup-related witnesses,
   including the new endpoint-free and synchronous-successor cases, with metadata.
5. Retain required-form artifact/profile certification and the separate normal
   startup, durable CDC delivery/lost-ACK and merge gates.

`I/commands-and-results.md` records the exact scheduler diagnostic and its
limited scope. `I/diagnostic-sha256.txt` freezes script, result, snapshots,
subject/delta, navigation and additional source observations.

All 63 obligations have evidence-backed dispositions. No blocking design
finding remains; P1 is the complete nonblocking erratum. Preserve the exact
approved design scope and existing caller/components. **Resource source and
broader recovery/merge acceptance remain HOLD.**
