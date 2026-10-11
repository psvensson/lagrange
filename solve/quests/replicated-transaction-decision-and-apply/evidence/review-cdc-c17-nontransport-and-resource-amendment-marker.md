# Independent C17 nontransport source and resource amendment review

Reviewer: `subagent:/root/review_marker_correction`. Author-distinct, read-only except this report. Date: 2026-10-11.

## Separate verdicts

- **SOURCE: REJECT the R3-3 through R3-7 correction packet.** R3-4, R3-5, R3-6 and R3-7 are supported at this bounded component scope. R3-3 is incomplete: an ordinary invocation joining an existing table generation ignores its own captured deadline (**N1** below).
- **DESIGN: REVISE** resource-handoff amendment `864abf59…` before transport/page-v2 implementation. Five concrete resource-contract findings (**D1–D5**) remain. The proposed owner split, binary page direction and atomic colocated reservation are coherent directions; naming them does not resolve their allocation and release schedules.
- Prior **R3-1/R3-2 remain unresolved SOURCE dependencies**, expressly deferred by this packet. They are not extra reasons for rejecting the narrow nontransport correction. This review does not approve the broader dirty worktree, startup, activation, snapshot recovery, or durable CDC event/original-event/lost-ACK recovery.

## Exact subjects and evidence

`W` = `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.
`E` = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011`.
`P` = `E/cdc-c17-round3-nontransport`.

| Subject | Exact fingerprint / verification |
| --- | --- |
| Base HEAD | `e7c89f4b5114c0238312d3831b65889a4622f4e9` |
| Proof snapshot | `d23a0746bf5ee6c9b659d43abe27630d86d38397` |
| Proof tree | `8de2a04f24b03c03d5b88d56161089d69f2c7c3c` |
| `P/source-manifest.sha256` | `40b5c87f667f6375064ff05ea80990beb282ddc49471058d3104623216c94d86`; independently matched all 49 entries to both worktree and snapshot bytes |
| `P/correction-manifest.sha256` | `47a76ca479551a42e7b5a8308466378b9bfa0010f980d9c4b474770a67456dbb`; 12/12 matched |
| `P/evidence-manifest.sha256` | `222862a5688513261c7e63248f2a30cf202a83c29211e11fd3f3182b6e758e60`; 9/9 matched |
| Amendment, denoted `D` below | `solve/quests/replicated-transaction-decision-and-apply/cdc-coverage-response-resource-handoff-amendment-20261011.md`; SHA256 `864abf590b82dbc302cfc721c3c26ed0aa1853048bb4fdf0ff529eb72d262207` |
| Prior rejected review | `E/review-cdc-c17-round3-marker.md`; SHA256 `1c91465bcbad72cc8c1d0df9d32d2aaff731234f9ff9df65933b4063a38e476b`, source snapshot `0b2bfb2bcf0cbbc1cef69754baba5bd9db5986e2` |
| Accepted underlying design | `cdc-continuation-20261011.md`, SHA256 `d6a6017acaa0cedfd42a388a4f2e89724291d36c37d5f50c9034038e0d79a3bf` |
| Focused local evidence | `P/focused-tests.log`, SHA256 `d2f8d209a177db0ca8277016826dc187daf1729a5db1a4d6a73fa16e0d8d4c22`: five files, **350 tests + 75 suites**, 350 pass, zero failed/cancelled/skipped |

The 12-path correction contains six production paths, five tests and the amendment. The 49-path manifest includes the prior scope and generated `test/shards/impact-graph-seal.json`; it is a subject census, not approval of every path or a new impact audit. `P/commands.md`, `verification-summary.md`, `semantic-red-correction.md`, exit codes and empty lint/diff logs were read. There is no executed predecessor-mutant claim in that correction map: its negatives are retained prior Q6–Q9 diagnostics. The earlier eight-file locked-Lab result belongs to **0b2bfb2**, not d23a0746. No d23 locked-Lab result was supplied for this review. I did not rerun the broad population.

Loaded AGENTS, rules, router, verification-template index/instantiated union, runtime and authority/recovery owners, current interaction registry and live adjacent consumers. Source line references below are relative to `W` unless prefixed `E` or `P`.

### Reference key

| Key | Path |
| --- | --- |
| CT | `src/cdc/cdc-integration-service-authoritative-catchup.js` |
| RO | `src/cdc/cdc-coverage-reconcile-owner.js` |
| RC | `src/cdc/cdc-complete-coverage-reconcile.js` |
| CO | `src/cache/system-table-cache-cdc-source-order.js` |
| PO | `src/cdc/cdc-coverage-transfer-owner.js` |
| FC | `src/cdc/cdc-coverage-fragment-consumer.js` |
| SC | `src/partition/partition-cdc-source-coverage.js` |
| ST | `src/partition/partition-cdc-coverage-transfer.js` |
| TC | `test/cache/system-table-cache-cdc-source-order.test.js` |
| TH | `test/cdc/cdc-authoritative-catchup-hydration.test.js` |
| TR | `test/cdc/cdc-authoritative-coverage-reconciliation.test.js` |
| TO | `test/cdc/cdc-coverage-reconcile-owner.test.js` |
| TP | `test/partition/partition-cdc-source-coverage.test.js` |
| TI | `test/integration/cdc-coverage-rejoin-formation.integration.test.js` |

## Complete findings

### N1 — Joined generation bypasses the new invocation deadline

**Source blocker; A3, Y2/Y7, F3/F4.** CT:36–46 correctly captures an omitted deadline once; CT:61–64 passes it unchanged. RO:338–355 then replaces `debt.execute` and returns `debt.inFlight` for an existing table without bounding this new caller's wait by its supplied deadline. A long foreground or background generation can therefore hold a shorter ordinary invocation past its complete-operation window. The outer owner has no separate wait bound.

Independent actual-service diagnostic: at virtual time 1000, start one `hydrateCdcPropagatedTablesFromAuthority({tables:[NODES],windowMs:1000})` with an unresolved descriptor read; start a second ordinary invocation with `windowMs:50` and no explicit deadline. Only one read is launched. At the second deadline, time 1050, both promises remain pending. Both settle at 2000, with the second reporting the first generation's deadline failure. This is a semantic bound failure, not a setup error or hang presented as proof.

The same defect was also reproduced with **both `windowMs` and `deadlineMs` omitted in both calls**. At t=1000 start `[NODES,SERVICES]`; at t=1050 start `[SERVICES]`; hold both descriptor reads. The first invocation spends its default 30 s NODES window at t=31000, then joins the existing SERVICES generation despite its outer deadline already being spent. It stays pending until t=31050. This is not dependent on a custom shorter-window option.

Required correction: retain the canonical coalesced debt/generation with its own bounded attempt lifetime, but give each joining invocation its original bounded wait/cancellation and typed spent result. On caller exit, release that caller's waiter references; a bare race that leaves its closures retained by the long promise is insufficient. Do not cancel another caller's admitted recovery, shorten the shared attempt to the earliest caller, or renew either caller/attempt budget. Pair fresh multitable and already-running/background join controls, including the longer caller's eventual valid progress. TH:121–137 proves the fresh-table case only; TO:38 tests coalescing without distinct caller deadlines.

### D1 — Full response allocation is checked after serialization

**Design blocker; A1, C1, Y5, J7/J8.** D:104–106 serializes and then verifies actual UTF-8 length against `maxSerializedBytes`. That can detect an overrun only after allocating the string. D:42–44 calls OFFER identity fields “fixed/bounded” but specifies no consumed bound for those fields or the whole router envelope. Actual remote wrapping adds `messageId` and `sourceAddress` at `src/transport/message-router-inbound-dispatch.js:476–481`; actual `sendRaw` stringifies the whole message at `message-router-delivery-behaviors.js:698–701`. ST:251–266 currently admits nonempty binding strings without a length cap.

Specify a checked, captured full-envelope bound before response construction/stringification, including JSON escaping, bounded identity/error fields, base64, string/frame copies and all wrapper fields. A post-serialization equality/upper-bound check may remain a consistency check. Define who refuses an insufficient token before allocation and the canonical deferred/failed result without allocating another oversized error. The router's proposed opaque token interface currently supplies a number, not the missing preallocation proof. Include small OFFER/error/duplicate replies in the count-and-byte admission rule and pending-handoff map bound. A variable data budget is requested here, not a claim that total Node process RSS equals the pool size.

### D2 — Recipient request settlement does not release the sender's response slice

**Design blocker; T2, Y5, C3/C4, O5/O6.** D:100–103 promises one chunk in flight and transfers an already charged source slice. D:115–118 allows the next chunk after the previous recipient request settles. D:104–110 releases that slice only on the **sender's** send callback/terminal socket event. These are different events. Receipt of chunk N and sending N+1 do not prove that N's sender callback has executed. Retried/duplicate requests create the same issue.

Specify an exact per-transfer/ordinal send-custody gate: a transferred slice cannot be reused while its old token is held. State whether release returns the reserved slice to the live root or frees it and requires a new admission; reserve before any subsequent allocation. Gate duplicates and define bounded defer/retryAfter plus the existing pool/socket wake. A socket/send map merely described as bounded does not establish a count bound if each live session may create repeated handoffs. Prescribe the schedule where the recipient settles and requests N+1 while the sender callback for N is withheld, including TTL/cancel. Do not infer callback order from transport ACK or from the sequential recipient loop.

### D3 — Cancellation is allowed to free an already adopted recipient claim

**Design blocker; S3/S4, C2/C4, R2.** D:69–74 makes claim adoption an ownership transfer, then says cancellation, mismatch or recipient refusal releases **both** exact claims. After adoption, the recipient may still hold chunks, base64/input, concatenated payload or decoded rows. Source cancellation/session TTL cannot drop those references. This is the same lifetime problem the amendment explicitly fixes for router-held tokens, left open for adopted claims.

Distinguish pre-adoption pair cancellation from post-adoption revocation. After adoption, the recipient must retire its exact lifecycle/operation and release only after its actual owned references are dropped or explicitly transferred. A late source cancel cannot free a successor claim or the adopted claim while it is in use. Define root/claim ownership and once-only release for cancellation racing adoption, decode, source retirement and recipient replacement. The count/bytes budget must remain charged until that owner releases it, even when semantic permission has already expired.

### D4 — Scheduling cache notifications does not release their payloads

**Design blocker; S4, R1, C4, O1/O5.** D:119–123 releases consumer staging/**notification** charges after listener scheduling. Actual CO:494–510 clones each notification record; CO:242–250 invokes notification owners. `src/cache/system-table-cache-observation-methods.js:359–376` schedules a closure retaining `record` and metadata, and the production scheduler is `setImmediate` (`system-table-cache.js:72–78`). Scheduling transfers ownership to that queue; it does not drop the copied record. Subsequent pages can start after consumer release while previous notifications remain queued.

Specify charge custody through the actual notification queue until the queued closure finishes or drops the reference, or remove the additional retained copy through a coherent existing-cache-owner change. Do not block publication on listener execution or let callback failure roll back already installed coverage. A late send/notification/cancel callback must release only its exact resource, preserving the synchronous installed fact and any newer suffix progress. This is a required extension of the existing cache/transfer interaction, not permission to add a new semantic ledger.

### D5 — The proposed consumer formula still omits the live cache comparison path

**Design blocker; A1, C1, O5, J7.** D:65–67 retains the existing consumer formula; D:75–86 reuses the measured ASCII S/C figures as acceptance arithmetic. D:118 removes JSON `{key,row}` digest reconstruction, which is useful, but actual cache staging also runs `JSON.stringify(previous.get(key)) !== JSON.stringify(row)` for **every final table row** (CO:449–455). This comparison remains even if the digest becomes binary. It can allocate two six-times-escaped NUL representations; it also visits unchanged cache rows outside the newly transferred page. `estimateCdcCoverageInstallRetainedBytes` at CO:566–584 counts entry overhead/cover/suffix, not those existing row serializations. ST:240–249's six-payload-copy formula is based on the new payload, not arbitrary previously retained cache rows.

The amendment must explicitly bound or remove this comparison allocation at its actual owner and recompute simultaneous source, consumer, cache staging and notification peaks. A source length probe and a binary transport alone cannot make all row data “never allocated as six JSON escape bytes” as D:44–45 claims. Preserve semantic row-change detection, same-N conflict checks and suffix retention. Add a NUL-valued existing row outside a small incoming page to the paired proof; prove the chosen size is admitted/refused before these allocations. The 8 MiB ASCII arithmetic is a prior measurement/control, not yet a proved page-v2 aggregate bound.

### Authoritative lifetime clarification applied to both verdicts

The user's latest clarification separates three lifetimes. N1 does **not** require expiring the shared attempt at the shortest caller deadline. D:135–141's “original deadline” must identify which lifetime it means; its revision should give one complete caller/shared-attempt/buffer timeline, including colocated adoption, within the existing owners:

| Lifetime | Bound / terminal event | What termination can release |
| --- | --- | --- |
| Each hydration caller | Its captured absolute deadline or cancellation, unchanged across tables and joined work | Its own waiter registration and captured references; not another caller, the valid shared attempt, or buffers held by consumers |
| Coalesced table attempt | Its captured bounded generation lifetime and exact lifecycle/current authority | Its execution permission and references it still owns; unresolved debt remains with the existing reconcile owner |
| Source root / adopted recipient claim / transport handoff / notification payload | Actual last-consumer release, with bounded count/byte admission before allocation | Only its exact owned references/charge; caller timeout, cancellation or session TTL cannot declare another owner's copies free |

Cache swap consumes the still-valid shared attempt's actuation authority and clock fence. A caller that already stopped waiting does not retract that installed fact; a longer valid caller may observe the same legitimate progress. Delayed completion must neither renew the expired caller nor reattach its waiter. The required paired integration witness must exercise short-caller refusal/reference release, continuing long-caller progress, colocated transfer, a delayed send callback and post-publication cleanup through the same candidate owners. The 63-item census below is a review index, not a claim that these integrated runtime facts are already proved. No generic tracking framework, new ledger or parallel scheduler is requested.

## Prior-finding disposition and preserved controls

| Prior item | Current disposition and concrete evidence |
| --- | --- |
| R3-1 actual byte/copy lifetime | Explicitly deferred source. Prior report Q1/Q2/Q3 remains the negative evidence; PO:62–82 still frees session accounting independently of external result references. D1–D5 prevent design approval. |
| R3-2 colocated affordability | Explicitly deferred source. RC:215–235 still reserves the fixed consumer PAGE peak before the source OFFER. D:63–88 proposes atomic S+C and is the correct interaction to revise; adoption/release D3 and aggregate D1/D5 still need resolution. |
| R3-3 one outer deadline | Fresh-table default fixed in CT:36–64 / TH:121–137; joining generation still fails N1. |
| R3-4 final publication fence | Supported: RC:176–190 passes real clock/current lifecycle predicate; CO:535 checks after throwable staging and immediately before CO:540–545 swaps. TC:241–274 pairs refusal and retry. Independent real-clock diagnostic below confirms overdue refusal and positive retry. |
| R3-5 discovery priority | Supported: SC:263–271 uses required owner RPC/leader/recovery token with CRITICAL work and delivery class; TP:571–579 checks both. RC:76–80 and PO:104–114 keep payload BACKGROUND. |
| R3-6 truthful shared diagnostics | Supported: PO:228–261 enumerates all endpoint owners in the same pool, naming actual source/target fields; TO:162–190 includes source-held identity observed by the recipient. The fixture intentionally has null optional metadata; it does not prove every production field via that assertion alone. |
| R3-7 canonical N text | Supported: CO:318–341 type/length precede decimal regex and BigInt; TC:277–297 pairs canonical `"7"` with numeric, -0, leading-zero, sign, whitespace, unsafe and overlong refusals. |

Compared the correction to the prior exact snapshot. Existing suffix UPSERT/DELETE, floor/replay, same-N contradiction, atomic staging failure, range and genuine-empty controls remain: TC:90,109,140,223,319,384,431,454,468,484. TH replaces an explicit-deadline instance with an omitted-deadline instance; no broad witness deletion occurred in this correction. The new publication test directly asserts row/floor refusal, one guard call and valid retry; its wider “all state” description in `semantic-red-correction.md` is supported by source ordering and older atomic controls, not by direct new assertions for every tombstone/revision/notification field.

## Category-complete checklist (63 items)

“Dependency” below means unchanged source inspected in context, not newly certified by five focused files. “Proposed” means design coherence or a future implementation/proof obligation, not a demand to run nonexistent implementation tests. Findings refer to the complete set above.

### Admission

| Item | Evidence and disposition |
| --- | --- |
| A1 | PO:117–146 reserves synchronously; RC:292–320 resizes before staging; CO:535 is the actual final fence. Source copy accounting is deferred R3-1/2. D:54–59/90–103 proposes probes before allocation, but D1/D5 block complete enforcement. |
| A2 | RC:30–45/155–173 distinguishes failed/deferred; RO:14–26/232–266 distinguishes complete/failed/retired/spent; CO:535–538 yields publication-stale/defer. Proposed lease/adoption failures need the canonical outcome, especially D1–D3; no empty success is allowed. |
| A3 | CT:36–64 has one outer budget; RC:80/91/210 carries it; RO:355 bypasses it for a joining caller: N1. D:135–141 states the right no-renewal intent, with that shared-generation interaction still required. |
| A4 | RC:54–73/155–190 and FC:52–105 consume exact response states/binding; D:24–30 makes handoff local and non-authoritative. New custody failure/duplicate/closed-socket result handling must be specified with D1–D3, not mistaken for coverage completion. |
| A5 | PO:81/149–157 → RO:150–151/376–397; TO:140/162/193/213/237/297 exercises capacity, cross-endpoint, route, socket, replacement and cache wakes. Active generation retry is 100–1000 ms, bounded by remaining time; idle release starts a generation. D2 needs the send-release event joined to this path. |
| A6 | RC:176–190 and CO:531–540 recheck actual clock/lifecycle after staging; independent wall-clock probe below passes. No post-swap retraction exists at CO:547. Future D:119–127 must keep that installed fact when resource callbacks arrive late (D4). |
| A7 | RO:74–100 reports real start/elapsed, table/partition/generation; PO:228–261 fixes held endpoint census. TO:260 and cross-endpoint assertions support this. D:129–133 must include adopted claims/transport holds in the same actual pool census. |

### Retry

| Item | Evidence and disposition |
| --- | --- |
| Y1 | RO:269–335/376–397 arms deadline/backoff/cooldown and event reentry; TO wake tests above are executable controls. `node-joining-ready-signal-readiness.js:589–600` and membership coordinator:355–435 are real callers. Full startup reachability remains an integration ceiling. |
| Y2 | RO:173–181/269–289 freezes generation deadline through unreadable descriptor reads. Q1 proves that freeze does not also bound a shorter joining invocation: N1. |
| Y3 | RO:14–26/223–266/306–322 exposes spent/retired/failed outcomes and retains failed debt for reconsideration. CT:71–80 reports table failures; no completion from timeout. D:124–127 must separate semantic stop from actual resource release (D3/D4). |
| Y4 | Canonical descriptor acquisition RC:205–212 is independent of missing target rows. Existing source/recipient fixed prelease cycle remains deferred; D:63–88 atomic pair removes that allocation order, subject to D3 custody and D2 release wake. |
| Y5 | PO defaults: 128 MiB, eight sessions, 30 s TTL; RO:31–36 retry 100–1000 ms, cooldown 1–30 s, power-of-two/10-minute diagnostics. At default 30 s a generation has at most roughly 300 retry opportunities per table, rather than an unbounded tight loop. Those counters do not bound actual copies or joined waiters. D1/D2/D4/D5 block queued-copy/count proof. |
| Y6 | CO:363–428/TC:454,468 preserves same-N contradiction vs exact replay. FC:139–190 binds each response/current transfer. D:47–52 proposes new-session recapture; D2 must make duplicate and next-ordinal sends resource-idempotent as well. |
| Y7 | RC binds the original deadline; transport ACK never edits it. CT fixed table iteration; N1 still violates caller inheritance when joining. D:135–141 must distinguish later background generations from the expired invocation and from installed facts. |

### Transport

| Item | Evidence and disposition |
| --- | --- |
| T1 | RC:54–59 rejects noHandler and malformed COMPLETE rows; TR:358/460 exercises these outcomes. Router inbound:435 transport ACK precedes handler; :449–456 noHandler is separate. The handoff token is not semantic success (D:24–30). |
| T2 | FC:139–156 checks exact current session after await; prior lifecycle controls remain. D2/D3 identify late response-slice and claim release schedules not resolved by identity checks alone. |
| T3 | RC:155–173 normalizes typed unavailable/deferred/failed with retryAfter; TR:460 verifies noHandler/timeout. Router local result spreading at delivery-behaviors:133–157 must unwrap the proposed handoff without treating it as a wire result. D1–D3 need matching failure outcomes. |
| T4 | RC:80 and RO deadline race bound unavailable handlers/connections for a generation; N1 qualifies joining callers. D:124–141 retains debt, but cancellation cannot free still-held bytes; no-handler/closed-socket/pre-send/throw must settle exact tokens and wake bounded retries. |
| T5 | TI:83 uses real routers/gateway/SQLite/cache with an in-process query-message-group adapter; it is not real WebSocket queue proof. D:152–157 correctly prescribes real WS callback/throw/close/shutdown controls. Add the N+1-before-N-callback schedule from D2. |

### Timers / sweep

| Item | Evidence and disposition |
| --- | --- |
| S1 | RO:65–71/173–191, PO:23–29/143–145 use injected clock and unref timers. No new timer source in the correction. D should use these existing owner timers; a transport token lifetime is tied to actual release, not an expiry authorizing reclamation. |
| S2 | SC:263–276/279 onward acquires required owner/leader evidence; ST chunk reads recheck source role/lifecycle; RC:176–184 fences cache action. Timer expiry never grants a scope or floor. Proposed D:47–61 retains this authority dependency. |
| S3 | Lifecycle owner:11–66 and RO:108–153 retire volatile generations; FC checks replaced targets. Existing durable reconciliation obligation is outside these JS sessions. D3/D4 require that retirement not free copies now owned elsewhere; router shutdown start is not automatically socket-buffer release. |
| S4 | Deferred R3-1: PO:62–82 TTL frees accounting regardless of external result references. D:108–110/124–127 addresses transport tokens, but D2–D4 leave reusable slices, adopted claims and notification payloads unresolved. |
| S5 | SC:263–271 fixes source discovery CRITICAL/recovery priority; payload remains BACKGROUND. RC scope reads do not require hydrated cache authority. Full closed-admission startup and durable CDC ACK delivery remain explicitly unproved; this packet does not change their owners. |

### Recovery

| Item | Evidence and disposition |
| --- | --- |
| R1 | Cache write sequence CO:430–447 final rows/suffix, :475–492 cover, :494–513 tombstones/revisions/emissions, :535–549 fence/swap/publication; source session writes PO:134–145/160–183 and ST:345–422. TC:90/109/384 preserves newer suffix and atomic failure. D4 forbids resource callback rollback of those facts. |
| R2 | Lifecycle owner:11–66, RO:161–170 and FC binding distinguish current target/generation from retired transfers. D:47–52 recaptures from a new transfer after session loss. D3 requires adopted-claim release to retain that distinction. |
| R3 | RC:67–73 dense rows; SC source coverage owns final/range receipt; TR:176/203/227 rejects incomplete partition sets; TC:223/319/454 rejects partial/contradictory absence. D:38–52 must encode explicit final/next and retain genuine-empty validity, not normalize malformed to empty. |
| R4 | TC:468 exact same-N replay is idempotent; :454 contradictory same-N refuses. TR:554 and TI:83 exercise source-session loss/recapture. D2 adds resource-safe duplicate ordinal behavior; D4 preserves post-swap installed fact after response loss. |
| R5 | TR:247/275/358, RC:54–73/155–173 refuse missing/foreign/unavailable owner facts as success. No metadata absence certifies empty coverage. Binary page-v2 needs the same strict completeness checks; no new alternate truth is proposed. |

### Concurrency

| Item | Evidence and disposition |
| --- | --- |
| C1 | PO:117–146 performs synchronous pool admission; RO:338–373 coalesces per table; correction adds actual swap fence. D atomic S+C is explicit new pool operation. D1/D5 still allocate beyond described proof, and D3 requires phase-specific claim ownership. |
| C2 | RC:241–250/292–320, FC:139–156 recheck after awaits and resize before cache staging. CO:535 checks current clock at actuation. N1 is invocation identity/budget loss on joining; D3 is cancellation versus adoption/decode custody. |
| C3 | Existing exact session resize PO:160–165 and generation identity RO:161–170 prevent stale session mutation; no new publication path. D2 needs a unique outstanding response-slice/ordinal winner, not merely a sequential recipient request. |
| C4 | RO retirement/timers/events coalesce; TO:61/116/140 covers these. D2–D4 require callback/TTL/cancel/close/shutdown exact release once, delayed notification ownership and no late rollback of installed cache state. |
| C5 | PO:32–49 uses actual node shared pool; binding RC:47–51 has request/target/lifecycle/generation/deadline. D:69–72 correctly binds the pair to exact transfer/target; D:129 socket/send identity must stay tied to that pool through endpoint retirement. |

### Formation / budgets

| Item | Evidence and disposition |
| --- | --- |
| F1 | Real chain: join/membership callers → CT → RC scope acquisition → owner-RPC read flow/gateway/QueryExecutor/router → partition source → FC/CO. TR:119 proves hosted recipient skips local full read; SC:263–271 is the corrected source discovery class. Existing TABLES/PARTITIONS/TABLES sandwich remains. |
| F2 | TR:152–275 exercises witnessed bootstrap identity, complete partition-set acquisition, epoch change and missing leader. Route setter/connection/cache wakes TO:193/213/297 reenter without minting scope from cache. End-to-end cold startup is a named dependency, not certified by those fixtures. |
| F3 | Ordinary join and membership callers omit explicit deadline (join:600; membership:377/431); CT now captures one. N1 shows such a caller can nevertheless join longer debt. No force-open or READY bypass was added. |
| F4 | Default foreground window is 30 s across tables/pages/chunks, not one per table; fresh-table TH:121 passes. RO may later run bounded cooldown generations. N1 requires per-invocation waiting semantics; D2–D4 require queue/callback waits to consume the same caller window while retaining owed resources/debt. |
| F5 | D:32–34 explicitly forbids snapshot bulk/raw socket/local handler bypass; payload stays canonical query/MG traffic and BACKGROUND. Source correction changes no global limits/decision owners. Durable event ledger and activation admission remain separate. |

### Harness / evidence

| Item | Evidence and disposition |
| --- | --- |
| H1 | `P/semantic-red-correction.md` accurately identifies retained prior diagnostics, not freshly executed old-source mutants. N1 is a new semantic counterexample on exact d23. Q2 below uses an actual real-clock staging stall; prior NUL-cursor/8 MiB reds remain deferred R3-1/2. |
| H2 | Q1 uses actual service/RO but substitutes an unresolved descriptor read. Q2 uses actual cache/staging with valid synthetic source evidence and injected notification scheduler. TI is actual SQLite/QueryExecutor/routers plus in-process query-MG adapter; no real WS or normal-startup proof is claimed. |
| H3 | Q1 advances to 1050 before 2000 and observes settlement separately; Q2 stalls synchronously past deadline before guard. D:152–169 requests actual blocked send callback/TTL controls; D2 requires recipient settlement and callback ordering to be independently latched. |
| H4 | TC:22–87 helpers include source scope/domain/cell/prefix/lifecycle/observation; RC binding :47–51 includes target/request/deadline. Page-v2 must preserve these fields plus ordinal/length and typed fixed bounds (D1), not replace authority with a hash label. |
| H5 | TC:90/468 nonempty rows and suffix; TR:554/TI:83 actual >16 MiB bytes and recapture are retained. They do not establish colocated affordability or live WS copy bounds. D:158–165 requires positive 8 MiB and low-cap/NUL controls; D5 adds existing-cache-row allocation, D4 queued notifications. |
| H6 | Exact manifests/logs above; local current population 350 tests/75 suites. Prior 435 runner entries belong to 0b2. No normal startup, durable event/lost-ACK or whole-C17 acceptance. A design vet does not require future tests to have already run. |

### Owner interactions

| Item | Evidence and disposition |
| --- | --- |
| O1 | SC/ST own source coverage, CO owns floor/suffix/visibility, PO owns transfer budget, router owns transport queue. D:15–30 correctly separates semantic/resource authority; D3/D4 must name exact post-transfer claim/notification owners. |
| O2 | Existing PAGE/OFFER/CHUNK/CANCEL vocabulary is in `cdc-coverage-protocol.js`; D explicitly proposes a new local typed handoff and page-v2, not a fictitious existing API. It must unwrap in both router paths; D1–D3 define unresolved contract consequences. |
| O3 | TC:241 pairs overdue refusal/fresh retry; :277 pairs bad N/good N. D:150–169 requires same-candidate capacity refusal and affordable completion; neither old 8 MiB arithmetic nor counters alone is that future proof. |
| O4 | TO wake controls and TR:554 recapture show retained debt can reenter canonical owner after source/session change. N1 requires caller expiry without permanently vetoing shared debt; D2 must release its send gate through the canonical capacity wake. |
| O5 | PO:104–114 pressure gate, RO singleflight/backoff remain. D2–D5 prevent reusing/freely dropping live copies. CRITICAL discovery does not elevate payload or remove source evidence requirements. |
| O6 | PO release→RO registered wake; service lifecycle:91/96/177 and CDC event delegates:29/128 are actual producers. TO controls observe firing. Future router callback and cache notification release must join those exact owners; a timer cannot substitute for last-owner release. |
| O7 | PO diagnostics/manifest/report are observations, never source authority. RC acquires witnessed scope; D token is expressly non-wire/non-semantic. Current row-source decisions still come from source owner/Raft witness, not recipient cache. |
| O8 | All subject/evidence fingerprints verified above. Prior negatives remain separate from current local greens; no changed criterion or invented semantic-negative run. Inline diagnostics are reproduced below and excluded from the positive population. |
| O9 | Canonical callers and adjacent RC/FC/source/router paths inspected. Required owner RPC skips hosted local `.all`; no new raw-read, bulk, force, direct handler or alternate completion path in this delta. D5 concerns an existing cache materialization path within the proposed resource scope. |
| O10 | `test/shards/impact-contracts.json:894–947/1797–1860` registers live source/startup/cache/gateway/query/router endpoints and eight witnesses. All five changed tests remain registered/classified; manifest includes generated seal. D:173–175 correctly requires new live transport endpoint and WS/local witness registration; that future landing obligation is not present implementation proof or a new audit result. |

### JavaScript / wire boundary

| Item | Evidence and disposition |
| --- | --- |
| J1 | CT:36–46 checks safe deadline addition; CO:318–341 canonical nonnegative decimal prefix including text `"0"`, rejecting numeric -0; ST:75–84 checked sums, FC offsets/counts. No new arbitrary trusted clock-host threat is asserted. D checked binary lengths/ordinals need explicit overflow-safe formulas including wrapper bounds (D1/D5). |
| J2 | `cdc-coverage-domain.js` validates strict own row data; RC:67–73 verifies dense own entries. Existing envelope/prefix field accesses assume canonical parsed/owner-produced records; this delta does not claim accessor-proof arbitrary internal objects. Proposed local tokens must be owner minted and wire records own/type validated. |
| J3 | Changed N seam performs repeated property accesses on owner/JSON records; no new single-capture hostile-host guarantee is claimed. Row accessor refusal TC:299 remains. New page-v2/handoff boundary must capture validated descriptors/lengths once before allocation; D1 cannot count one shape and serialize a changing one. |
| J4 | Existing strict row/prototype discipline and TC hostile-row controls remain; no prototype data is newly promoted to source authority by this correction. Broader arbitrary host prototype rewriting is outside the declared authority/recovery threat boundary. New wire/page records retain canonical validation. |
| J5 | CO:321 primitive string/length gate excludes boxed/nonstring prefixes before regex/BigInt; TC explicit numeric/sign/space controls pass. Domain guards preserve primitive columns. D OFFER/session/ordinal/digest fields need concrete bounded primitive domains before allocation (D1). |
| J6 | Existing native intrinsics/strict domain validators are unchanged dependencies. No claim of protection against arbitrary trusted-host replacement of JSON, Buffer, Map or Number is made or required; no existing defense was removed. |
| J7 | FC:52–105 bounds base64 encoded length before decode; CO:318–341 type pins N. Source canonical JSON cursor/digest expansion remains deferred R3-1. D binary payload helps but full envelope and existing cache JSON comparison still violate its allocation argument (D1/D5). |
| J8 | RC:67–73 bounds dense rows to 256, domain validators reject exotic row data. D:54–59 promises row count plus exact entry/cursor bytes before materialization; D1 requires analogous OFFER/envelope bounds, D5 existing-cache work, and D2/D4 bounded queued copies. Array count alone is insufficient. |

## Independent diagnostics retained in this report

### Q1: ordinary caller joins a longer generation

Executed read-only in `W` using `node --input-type=module`:

```js
import {CDCIntegrationService} from './src/cdc/cdc-integration-service.js';
import {SystemTableCache} from './src/cache/system-table-cache.js';
import {TABLES} from './src/constants/index.js';
import {VirtualTimeSource} from './src/time/time-source.js';
const clock = new VirtualTimeSource({startMs: 1000});
const service = new CDCIntegrationService({nodeId: 'review-deadline-join',
  timeSource: clock, systemTableCache: new SystemTableCache({timeSource: clock})});
let reads = 0;
service.executeAuthoritativeSystemTableRead = async () => {
  reads += 1;
  return new Promise(() => {});
};
let firstDone = false, secondDone = false, secondResult;
const p = service.hydrateCdcPropagatedTablesFromAuthority({
  tables: [TABLES.NODES], windowMs: 1000,
}).then(x => { firstDone = true; return x; });
await new Promise(setImmediate);
const q = service.hydrateCdcPropagatedTablesFromAuthority({
  tables: [TABLES.NODES], windowMs: 50,
}).then(x => { secondDone = true; secondResult = x; return x; });
await new Promise(setImmediate);
clock.advance(50);
await new Promise(setImmediate);
console.log({at: clock.now(), firstDone, secondDone, reads});
clock.advance(950);
await new Promise(setImmediate);
console.log({at: clock.now(), firstDone, secondDone, reads, secondResult});
await Promise.all([p, q]);
service.markShuttingDown();
```

Observed projections (diagnostic logger output omitted, not counted as assertions):

```json
{"at":1050,"firstDone":false,"secondDone":false,"reads":1,"secondExpectedDeadline":1050}
{"at":2000,"firstDone":true,"secondDone":true,"reads":1,"secondResult":{"tablesAttempted":1,"tablesHydrated":0,"rowsApplied":0,"rowsSwept":0,"tablesFailed":["nodes"]}}
```

This was independently reproduced twice, including once after the report finding was drafted. No application rows, files, source or logs were edited. The unresolved descriptor is the sole substituted failure seam; the budget capture, live generation join, timers and outcomes are production owners.

An additional all-default schedule used the same real service, unresolved-read seam and injected clock. Start the first promise with `tables:[TABLES.NODES,TABLES.SERVICES]` at 1000; advance 50; start the second with `tables:[TABLES.SERVICES]`; advance 29950 and flush `setImmediate`; then advance 50 and flush again. Neither call supplies `windowMs` or `deadlineMs`:

```json
{"at":31000,"firstDone":false,"secondDone":false,"reads":2,"firstExpectedDeadline":31000}
{"at":31050,"firstDone":true,"secondDone":true,"reads":2}
```

### Q2: real-clock pre-swap stall and queued notification custody

Executed an inline actual `SystemTableCache` probe using the valid scope/page construction of TC:22–87 (NODES schema-complete row, scope/domain/cell, prefix `"7"`, leader lifecycle and canonical observation digest). Set a `Date.now()+25` deadline. Wrapped the actual `deepClone` only to busy-wait the first staging clone until deadline+5, and supplied `canPublish: () => Date.now() < deadline`. Restored the original clone and retried the exact page with a current predicate. The permitted cache scheduling seam collected callbacks; one ordinary cache listener counted delivery.

```json
{"case":"real-clock-final-fence","elapsedAfterDeadlineMs":5,"reason":"cdc_coverage_publication_stale","installed":false,"rowPresent":false,"queued":0}
{"case":"fresh-retry-and-notification-custody","installed":true,"rowPresent":true,"queuedCallbacks":1,"delivered":0}
{"case":"notification-drain","delivered":1}
```

The first projection supports R3-4 at the actual cache actuation seam. The second directly exhibits the scheduled-but-undelivered closure addressed by D4; it is not a real-WebSocket or full startup test, nor a measurement of proposed page-v2 memory high water. Production `setImmediate` is separately source-verified above.

## Scope retained after this verdict

Finish N1 through the existing reconcile owner. Revise D1–D5 as one resource ownership contract before transport implementation. Preserve the already corrected final publication fence, CRITICAL discovery, pool diagnostics, strict prefix validation, same-N/absence checks and CDC suffix controls.

The requested whole-operation 128 MiB claim remains **unproved**, because counters are not a census of live response, serialization, adopted-consumer and queued-notification copies. Supported oversized cache-state rows, multiple-page backlog and simultaneous sessions must all obey that eventual contract. This says nothing about acceptance of the separate durable CDC event-obligation ledger or delivery of its original events/ACKs. Normal startup/restart while ordinary mutation is closed remains a separately authorized integration obligation; it is not an additional rejection criterion for this bounded source packet.
