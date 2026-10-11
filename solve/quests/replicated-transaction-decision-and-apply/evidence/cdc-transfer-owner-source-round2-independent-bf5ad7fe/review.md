# Independent CDC transfer-owner source review — round 2

Date: 2026-10-12 Europe/Stockholm. Independent verifier:
`subagent:/root/review_checkpoint_composition`. Product tree read-only.

## Verdict

**REJECT the corrected slice pending one remaining grouped finding, PO-5:
input capture can reenter after the current-claim check and before claim
acquisition.** Three concrete callout schedules invoke the terminal callback
twice across the same old claim and make the outer call throw. A valid
successor remains intact and can complete; no double byte return or successor
corruption is claimed.

All ten prior PO-1–PO-4 counterexample/control observations now pass on the
exact corrected source. The correction's scalar capture, nonterminal
retirement guard, bounded synchronous wake dispatch and endpoint-free
diagnostics are accepted at those tested scopes. PO-5 is the remaining
capture-to-consumption interaction, not a reopening of caller2de or the
approved resource design.

Independent registered test run: **5 files, 438 assertions, all pass**,
including the focused file's **114 assertions**. Impact and shard audits pass.
These tests do not exercise the remaining reentrant capture schedule.

A separate nonblocking evidence clarification is recorded below: the actual
subsystem metadata delta changes two observed imports and its observation
digest. It adds no test classifications; the author's “11 omitted tests”
description is not established by the retained delta/audit.

## Exact subject and preservation

C = `/mnt/data/peter/projects/.worktrees/tx1-cdc-20261011`.

| Subject under C | SHA-256 |
| --- | --- |
| `src/cdc/cdc-coverage-transfer-owner.js` | `f25e59b5dbfbb7ce07ddd2159ad8ae5dfeff06ff3d7dbf9a2643fcc393312627` |
| `test/cdc/cdc-coverage-lifecycle-owner.test.js` | `f2dceed1e9f244c7f2f975f28908baa06efdd25649616c5040aaca2fbe5c3912` |
| `test/shards/subsystem-classes.json` | `cfc1f79e47cff18887d1918b9cc15f7a4163738f58b2f81ff4c5956ec8c3ee2f` |

All three match live bytes and exact Git objects in preservation snapshot
`7a8dfa2822c15dd6ee497933669d835da832c561`. That snapshot includes other
WIP; this review covers only the three named subjects and their bounded
interaction.

Author packet:
C/`solve/quests/replicated-transaction-decision-and-apply/evidence/cdc-transfer-owner-implementation-round2-20261011T2255` (**AUTHOR** below).

- Report: `2e9d9b65347b388391e2d49c713b263cbcea27ec02c340e418c6d2eef47b2ab9`.
- Nineteen-entry manifest:
  `2e47d98ba9adc3728736fb26630839577b22173b1f06e748d73d4b9150429495`.
  All entries independently match.
- Source/test delta:
  `e67e8c98b0fea4139f7d685dbcf47b9d412aa845142b8ac5bfaddf7b999795d0`.
- Metadata delta:
  `ac1a503e47fd8cf7ec285c8a3a48de7c7e1bcc84655ca27c9dff1bdfb6ba917f`.

Prior rejected source snapshot `c8800cd70d315b27034506d5632c6d554fabbb80`,
round-one report
`98b1ac59e078b20f71a7c3f67e88e653c8ef080c46ae4ec6957fe458f0ba9102`,
and its evidence remain unchanged.

Approved design plus erratum remains
`cfe7405ce63469383c879c7dd3de6406b255468cd3e6816fbdbb5c219019eb84`.
Caller source `2de419483c9b4ce9e3fabc87bb54d93e4afb8817` remains closed.
Current reconcile-owner SHA
`0d844cff666dfcd3e7aa58246b782cad5ccfdd5f321e7b5af8d795fdc949218a`
matches the prior independently checked caller bytes.

## Evidence references

D = `/mnt/data/peter/projects/.worktrees/rs-raft-candidate-20261011/test-output/continuation-20261011/cdc-transfer-owner-source-round2-independent`.

- **PO**: C/`src/cdc/cdc-coverage-transfer-owner.js`.
- **LT**: C/`test/cdc/cdc-coverage-lifecycle-owner.test.js`.
- **RO**: C/`src/cdc/cdc-coverage-reconcile-owner.js`.
- **LO**: C/`src/cdc/cdc-coverage-lifecycle-owner.js`.
- **P**: D/`owner-counterexamples.mjs`; structured results
  `counterexamples.json`, raw `counterexamples.txt`.
- **B**: D/`descriptor-boundaries.mjs`; results
  `descriptor-boundaries.json`.
- **X**: D/`capture-reentry.mjs`; structured results
  `capture-reentry.json`, raw `capture-reentry.txt`.
- **TEST**: D/`cumulative-tests.txt`.
- D/`commands-and-results.md` records commands, exit codes and scope.
- D/`source-ledger.json`, `git-object-checks.json`,
  `packet-checks.json` and `metadata-comparison.json` bind exact source
  and evidence observations.

The P/B scripts are byte-identical to independent round-one scripts and the
author's retained copies. Their hashes are respectively
`cddc57673257908ad8a4ed933d85180837986a577820627b865fe1181a7e126d`
and
`bfed5cfefa48671b81869b51876c777043bd0fbc851a144df55a983c4266bdc5`.

Independent evidence hashes:

| Artifact under D | SHA-256 |
| --- | --- |
| `manifest.sha256` (22 files) | `b8059c037cb5c9d0370366de4b3b031573098180555d661e19a7a9bb250c0afb` |
| `counterexamples.json` | `03be80a99aedf1db9662ebe468f1b8c7cf01993fb0e6a5f9c2e006598826c5dd` |
| `capture-reentry.mjs` | `a4caed2780eb69dd8be465f00fb0422bf0c2fa1edf131dffe330a51b5164681f` |
| `capture-reentry.json` | `e4175033929ff2ec612770b6deb45114c1f54378a0030ccfd078c9c7eb7670ed` |
| `capture-reentry.txt` | `1b958c19931abc3f8e477c4a491b5017ae7b70507d5ca4270ceebb000fcdb701` |
| `cumulative-tests.txt` | `8e17d183103756485d986852edf41c355e816e5aa6c95687d2b22e67b27b9ba3` |

## PO-5 — capture can settle the old claim before the outer call acquires it

**Blocking; one grouped admission/concurrency/JS-boundary finding.**

PO:341–347 checks exact service, state, active claim, shutdown record, phase
and release capability. However, `options.terminalize`,
`options.descriptor` and the descriptor's Proxy
`getOwnPropertyDescriptor` traps can execute code after relevant checks.
The method does not revalidate the same current claim after those callouts.
It proceeds at PO:358–360 to use the old state and then rereads/invokes
`options.terminalize` at PO:363.

X supplies a complete own-data descriptor through a Proxy. Its first
getOwnPropertyDescriptor trap uses the real public API to:

1. complete the same old claim successfully with an ordinary valid descriptor;
2. reserve a valid same-node successor; and
3. return the requested property descriptor normally.

The outer capture finishes successfully. Despite the nested completion,
the outer call enters TRANSFERRING, invokes its terminal callback once more,
and tries to write `terminalDescriptor` through the already-cleared old
`state.pool`. The result is an uncaught
`Cannot set properties of null (setting 'terminalDescriptor')`.

The identical failure occurs when the callout is the
`options.descriptor` getter or the first `options.terminalize` getter.
No intrinsic, prototype or internal state is patched.

| Schedule in X | Nested completion | Outer terminal callback | Outer outcome | Successor |
| --- | --- | --- | --- | --- |
| descriptor Proxy trap | true | called once after nested completion | throws at null old pool | admitted and later completes |
| options.descriptor getter | true | called once after nested completion | same throw | admitted and later completes |
| options.terminalize getter | true | called once after nested completion | same throw | admitted and later completes |
| options.shutdownRecord getter control | true | not called | false | admitted and later completes |

The last row is a useful ordering control. That getter runs before the
remaining release-capability check, so the existing code detects the nested
completion in that particular position. It does not rescue the later
capture sites.

After each of the three failures, the recorded before-successor-completion
state still shows exactly 16,777,216 charged bytes, two generations and one
release. The successor then completes normally. This finding is **not**
reported as double subtraction, lost successor custody, permanent deadlock,
a wire protocol violation, or a witnessed native shutdown failure. The
actual violation is stale consumption, duplicated terminal callback and an
unowned exception at the local compare-and-transfer API.

### Required bounded correction

Treat the complete terminal API as one capture/acquire/settle interaction:

- Capture the handoff inputs and callback once into owned values.
  Ordinary accessor properties on options can be refused using own-data
  descriptors without executing their getters. The callback must not be
  fetched from options again after acquisition.
- Own-data inspection of a Proxy can itself invoke traps. Account for that
  callout by checking/acquiring the exact still-current claim at the actual
  consumption point after capture, or by an equivalent owned nonterminal
  reservation before callouts with correct failure restoration.
- If capture already caused another operation to settle/replace the claim,
  the stale outer attempt must refuse without invoking terminalize again,
  changing completed state, returning credits or affecting the successor.
- Preserve a retryable owned claim on ordinary invalid/throwing capture and
  failed terminal callback; preserve a final result after successful transfer.
  Continue the corrected fixed-snapshot wake behavior.

No new validator owner, retry framework, timer or native barrier is required.
The correction should add the Proxy and option callout schedules to the
registered witness beside the existing legitimate handoff/recovery cases.

## Whole terminal API callout/reentrancy inventory

This inventory covers all actual input/callback seams in the changed
operation, not just the first failing field.

| Phase / source | Potential external execution | Current disposition |
| --- | --- | --- |
| PO:339–343 owner/state/claim checks | None under existing trusted Map/WeakMap host model | Exact checks are useful but precede later input callouts |
| PO:344 shutdownRecord read | An ordinary getter or Proxy get trap | X ordering control refuses after nested completion because later capability check sees null; capture should still be canonical |
| PO:347 terminalize type read | Getter/Proxy get trap | PO-5: after capability check; can settle old claim before outer acquisition |
| PO:350–351 descriptor read | Getter/Proxy get trap | PO-5: after initial check; same stale continuation |
| PO:122–126 own descriptor capture | Proxy getOwnPropertyDescriptor traps | Ordinary accessors/inherited data are refused; Proxy trap can reenter before acquisition. Throwing trap is caught; successful reentrant trap is not fenced |
| PO:130–159 scalar validation/freeze | No caller accessors after capture under existing trusted built-ins | B passes all numeric/own-data refusals; selected values remain scalar and fixed |
| PO:358–360 claim acquisition | Internal writes | Does not confirm that the captured state's ownership survived preceding callouts |
| PO:363 callback property reread and call | Option getter a second time, then terminal callback | Must use captured callback. Once genuinely acquired, ordinary callback recursion/retirement is correctly fenced by current TRANSFERRING checks |
| PO:364–372 failed callback | Error/wrong-result restoration | Prior throw/wrong-result plus retirement attacks now recover correctly; no reopening of PO-2's tested fix |
| PO:374–389 final settlement | Internal scalar/state/byte writes | Correct on a current claim; PO-5 reaches this with old pool null |
| PO:390 / PO:162–172 wake dispatch | Each registered synchronous wake; newly registered functions excluded from current snapshot | Exceptions are counted, later wakes run, no repeated release; X confirms no expanding current pass. wakeFailures is a diagnostic scalar, not release authority |

The ordinary callback's actual MessageRouter pointer stripping and native
two-check fact are still downstream implementation obligations. This report
does not substitute a scripted callback for those future proofs.

## Cumulative correction results

| Prior finding | Independent result on these exact bytes |
| --- | --- |
| PO-1 selected field changes after validation; late accessor copy | **Original witnesses pass.** PO:118–159 captures scalar own data once; mutation cannot enter retained custody. Accessor refusal leaves original claim retryable. The injected 1 MiB graph and normal service/record controls are collectable. PO-5 remains the separate reentrant-capture gap before acquisition. |
| PO-2 retirement while TRANSFERRING loses owner | **Pass.** PO:457–461 refuses retirement for every nonterminal owned claim. Throw and wrong-result callbacks retain the same reachable owner and later succeed (P, LT:404–444). |
| PO-3 throwing wake skips later wakes | **Pass.** PO:162–172 isolates synchronous failures and records wakeFailures; both row-session and listener paths use it. Later wakes run exactly once, completed release stays true, duplicate stays false (P, LT:447–500). |
| PO-4 endpoint-free diagnostics report zero | **Pass.** PO:482 observes the retained canonical node pool without creating an endpoint. P sees the same 16 KiB before retirement, after retirement and after reattachment. |
| Paired capacity/progress controls | **Pass.** Exact 16 MiB reservation and synchronous successor, one-byte-short refusal, failed mutation then valid retry, stale release refusal and same-node endpoint-free continuation remain positive. |

New X also passes four controls: shutdownRecord reentry safely refuses; a
throwing Proxy capture is refused followed by valid same-claim recovery;
ordinary Proxy capture reads each of eight properties once; registration
during a wake waits for a later actual release. Its three failures are
manifestations of PO-5, not three unrelated findings.

## Metadata and evidence clarification

The subsystem file is valid generated metadata; independent
`npm run audit:shards` and `npm run audit:impact-contracts` both pass.
The existing source/test coupled pair remains registered in
`test/shards/impact-contracts.json` at the coverage owner entries;
LT remains classified as unit/ordinary/cdc-metadata. New PO-1–PO-4 behavior
tests were added inside that already registered file.

Direct comparison to c880 shows:

- census remains 2,349;
- no classes added, removed or reassigned;
- only observationDigest and observations change;
- the retained delta adds the cdc-lifecycle-constants observed import to one
  catchup test and pressure-governor to the partition coverage test.

AUTHOR/`commands-and-results.md` says an omitted 11-test census was repaired,
but its initial audit says “ordering/metadata drift,” and the retained delta
does not show omitted tests. This is a **nonblocking evidence-description
correction**, not a source/metadata failure. Retain the actual generated delta
and audit result; do not infer additional test-registration work from that
sentence.

## All 63 category dispositions

Every item cites the current concrete source or diagnostic. “Pass” is bounded
to this slice. “Downstream” is a retained gate, not approval of missing source.
The repository's same ten full verification templates remain the applicable
union; arbitrary hostile-runtime monkeypatch immunity is not added.

### A — admission and consumption

| Item | Disposition and evidence |
| --- | --- |
| A1 Same state precheck/enforcement | **Fail PO-5.** PO:341–347 checks before PO:350/123 callouts; X proves consumption at PO:358 is stale. Capacity check/debit remains synchronous PO:284–309, positive P. |
| A2 Transient/hard refusal | **Pass prior refusals; fail PO-5 exception.** Capture failures return false PO:127–128/352; nonterminal owner survives callback failure PO:364–372/457. Stale post-capture path throws instead of refusing. |
| A3 Existing budgets | **Pass slice.** PO:11–17 unchanged 128 MiB/16 MiB/16 KiB/8 sessions; no new wait. RO caller/attempt deadlines unchanged. Native/admission budgets downstream. |
| A4 Reason/result shapes | **Fail PO-5.** Claim/null and boolean transfer with exact fixed result remain source shapes, but X emits uncaught null-pool error after stale callback. |
| A5 Credit-release observation | **Pass current-claim path.** PO:382–390 returns Wlistener once then wakes; P and LT:447 show later wakes after failure. X shows no second credit return in PO-5. |
| A6 Freshness at consumption | **Fail PO-5.** Exact ownership must still hold after capture. X identifies all later-callout failures and earlier shutdownRecord control. |
| A7 Truthful identity/holds | **Pass PO-4 correction.** PO:480–519 reports actual standing pool after endpoint removal; wakeFailures reflects completed dispatch. No diagnostic grants transfer authority. |

### Y — retry and bounded progress

| Item | Disposition and evidence |
| --- | --- |
| Y1 Retry fires | **Pass prior recovery; fail stale outer disposition PO-5.** P confirms throw/wrong-result recovery. X confirms valid successor finishes after the failed outer call; no claim of full listener retry wiring. |
| Y2 Frozen unreadable evidence | **N/A new reads/waits.** PO terminal helper is synchronous memory-only. RO:411–460 remains original budget owner; physical drain remains downstream. |
| Y3 Explicit exits | **Fail PO-5.** Capture error/null and callback failure return false, but successful reentrant capture reaches uncaught exception. |
| Y4 Mutual waits | **Pass local prior defect.** PO:457 prevents losing owner while held; P exact-capacity and retry controls succeed. No distributed wait cycle added or certified. |
| Y5 Attempt/concurrency ceilings | **Pass local bounded population.** One active listener PO:288, fixed fields PO:45–57 and one fixed wake snapshot PO:164. X confirms callbacks added during dispatch do not expand current pass. Full endpoint/native population is downstream. |
| Y6 Late duplicate effects | **Fail PO-5 callback duplication; pass byte CAS controls.** P rejects completed old claims; X later capture calls terminalize after nested success. The accounting is not double-debited. |
| Y7 Reset semantics | **N/A ACK/attempt reset.** No ACK path or renewal was added. PO:313–326 first-check observation clears only old projection; RO budgets unchanged. |

### T — delivery and wake semantics

| Item | Disposition and evidence |
| --- | --- |
| T1 ACK versus processing | **Pass local exact-result contract.** PO:369 requires exact terminalResult, not truthiness; P wrong-result control recovers. Native processed/drained fact remains downstream. |
| T2 Late callback | **Fail PO-5.** Completion during capture makes outer callback stale. Current TRANSFERRING recursion and completed-claim refusal remain positive in P/LT. |
| T3 Outcome classifiers | **Fail PO-5 local result shape only.** No new wire response classifier in PO; options-triggered exception crosses the stated boolean API. Caller2de untouched. |
| T4 Undeliverable bounds | **N/A network path in slice.** PO:337–392 sends no message, awaits no ACK and reads no receiver. Future no-handler/drain source remains HOLD. |
| T5 Stub contract | **Scoped pass.** LT/P/X call actual owner API with complete identities and controlled callbacks. They prove local reentrancy; not MessageRouter/ws/native lifecycle. |

### S — timer and lifetime

| Item | Disposition and evidence |
| --- | --- |
| S1 Clock/unref | **Pass unchanged.** PO:73–79, 258–263 retain row-session clock/timer unref; LT virtual expiry remains green in TEST. New handoff creates no timer. |
| S2 Authority | **Pass local gate with PO-5 consumption defect.** Boot/generation/claim/shutdown identities PO:280–295 and 341–347 are local capabilities; no Raft authorization claim. |
| S3 Memory crash equivalence | **Scoped pass.** PO:38–40 volatile maps; P GC controls now collect injected graph and retired service/record. Durable debt not stored here; restart reconstruction downstream. |
| S4 Legal windows | **Pass original hold retention.** Rterminal never expires or becomes borrowable, PO:473–475. Invalid captures and failed callbacks retain retryable ownership; PO-5 concerns stale use, not early TTL. |
| S5 Starvation | **Pass earlier owner-loss fix; downstream open.** P retry/successor controls pass. PO adds no sweep/SQL-read dependency; whole startup starvation not certified. |

### R — recovery and replay

| Item | Disposition and evidence |
| --- | --- |
| R1 Stale cannot clobber live | **Fail stale invocation PO-5; no demonstrated successor clobber.** X records correct successor accounting and completion after outer error. Current claim must be rechecked before terminal callback. |
| R2 Restart/live distinction | **Pass local identity scope.** PO:293–297 exact claim/boot/generation and shutdown object; P same-node new endpoint preserves standing reserve. Actual process restart is outside this API. |
| R3 No obligation erasure | **Pass PO-2 fix.** Nonterminal retirement refused PO:457; failed callbacks preserve same owner. No CDC row/ACK obligation is deleted by this module. |
| R4 Replay CAS | **Pass byte accounting, fail callback exactly-once PO-5.** P stale/reentrant guards remain green; X shows one nested release but second terminal callback before error. |
| R5 Absence not completion | **Pass PO-4.** PO:482 reads retained canonical pool; PO:473 retains terminal pool. Unknown endpoint no longer hides known same-node charge. No durable absence inference. |

### C — concurrency

| Item | Disposition and evidence |
| --- | --- |
| C1 Synchronous gate/backstop | **Fail terminal acquisition PO-5.** Capacity acquisition PO:288–309 remains atomic; terminal state check/acquire spans caller code PO:347–360. |
| C2 Revalidation after callout | **Fail PO-5.** No await is needed: option getters and Proxy descriptor traps are actual synchronous callouts. Whole inventory above names each. |
| C3 Single winner | **Pass current TRANSFERRING retirement guard; fail pre-CAS capture window.** PO:359/457 blocks recursive settlement after acquisition but X completes before acquisition. |
| C4 Reentry | **Fail PO-5 only in this pass.** P proves prior callback/wake fixes. X proves fixed snapshot and successful successor while exposing capture reentry. |
| C5 Resource keys | **Pass canonical node scope.** PO:69/82–101 and 280 require nonempty node identity for persistent listener; PO:482 diagnostic lookup uses same key. Canonical service identity is an existing composition assumption, not arbitrary host mutation proof. |

### F — formation and self-dependency

| Item | Disposition and evidence |
| --- | --- |
| F1 Complete operation inventory | **Scoped complete.** PO:274 acquires pool/claim; PO:118 captures eight fields; PO:353 creates result; PO:375–390 settles and dispatches; PO:454 retires; PO:480 reads projection. External callouts enumerated above. No SQL/cache/socket dependency introduced. |
| F2 Wake without hydration | **Pass same-owner wake correction.** PO:162/198/390 invokes existing callbacks even after one throws; real unchanged consumer RO:235/533. Full listener wake startup path not implemented. |
| F3 Formation caller budget | **N/A new client operation.** PO begins no client wait. RO exact accepted caller bytes unchanged; no reopened N1/N2 review. |
| F4 Aggregate arithmetic | **Pass local accounting/copy fix.** P exact capacity, below capacity, retained 16 KiB and collectable 1 MiB injection all pass. Full native/transport S/H/C/K equations require later source proof. |
| F5 No bypass | **Pass.** Same PO pool and canonical methods only; no raw Raft, SQL, force-open, alternate ledger or new completion framework. |

### H — harness fidelity

| Item | Disposition and evidence |
| --- | --- |
| H1 Real failing mechanism | **Pass evidence.** X imports frozen production PO and records nested true, successor admission, stale outer callback and exact null-pool throw. No setup/import or timeout failure. |
| H2 Faithful local seams | **Scoped pass.** LT/P/X callbacks operate on actual production pool; no model pool. Full MessageRouter object graph is deliberately not represented. |
| H3 Timing/order | **Pass.** X reentry occurs synchronously during capture; no artificial deadline. P GC control uses actual turns; no native close-phase claim from these tests. |
| H4 Complete fields | **Pass.** X desc() has all eight fields and valid boot/claim/shutdown record; nested and successor operations use full ordinary descriptors. |
| H5 Nonvacuity | **Pass.** Recorded active 16 MiB, one nested release, second generation, outer callback count and later successor completion; P graph is real 1 MiB Buffer. |
| H6 Actual graph versus model | **Pass slice.** P normal/injected WeakRefs now collect; actual retained descriptor stays scalar. No terminal Promise/Immediate/native coefficient census is claimed. |

### O — owner interaction

| Item | Disposition and evidence |
| --- | --- |
| O1 Single semantic owner | **Pass architecture.** PO owns all node charges/release capability; no second store or retry loop. |
| O2 Typed handoff | **Fail PO-5.** Canonical scalar descriptor now sound after capture; operation has no current-claim fence after its capture callouts and rereads callback options. |
| O3 Refusal and progress paired | **Pass evidence, source still rejected.** Same candidate passes prior ten observations and X legitimate controls, while failing only three grouped stale-capture schedules. |
| O4 Old then new | **Fail stale outer callback PO-5; positive successor preserved.** Every X failing schedule admits and completes its successor. P duplicates cannot free successor bytes. |
| O5 Pressure/backoff | **Pass existing cap.** PO:288 refuses below capacity; no limit raised or wait reset. P exact-capacity/below-capacity controls; downstream memory gates unchanged. |
| O6 Canonical release wake | **Pass PO-3 correction.** PO:162 fixed snapshot continues after failure; LT:447 covers row and listener. X callback registration does not extend current iteration. |
| O7 Projection not authority | **Pass.** diagnostics/ wakeFailures record state, never authorize release. Exact claim still required; no copied READY/CDC authority. |
| O8 Source/evidence fingerprints | **Pass.** All three snapshot objects match; author 19 entries match. P unchanged; X exact script/logs and TEST bind current source. No predecessor green or future-source treatment fabricated. |
| O9 No alternate escape | **Pass inventory.** New listener APIs remain owner+tests; RO unchanged canonical wake. No hidden success fallback; absence of actual router caller is a declared downstream gate. |
| O10 Contract/metadata/proof | **Pass registration; evidence clarification retained.** Existing coverage source/test coupled pair remains, audits green, new tests inside registered LT. Metadata changes observed dependencies only; future PO-5 test must join same registered surface. |

### J — JS contract boundary

| Item | Disposition and evidence |
| --- | --- |
| J1 Numeric lattice | **Pass.** PO:134–157 validates safe nonnegative non--0 integers and small sum; B independently rejects NaN/infinities/negative/unsafe/boxed/string/-0. Fixed base subtraction remains exact. |
| J2 Own data | **Pass descriptor; options capture incomplete PO-5.** PO:123–125 requires own data and B inherited case refuses. Ordinary option getters remain executable; they can be refused without invocation using canonical own-data capture. |
| J3 Accessors/TOCTOU | **Fail PO-5.** Descriptor plain accessors refused without evaluation; Proxy own-property traps still reenter. options.terminalize is read twice. Required current-claim consumption must follow all capture callouts. |
| J4 Prototype protection | **Pass descriptor scope.** Null-prototype captured record and own property descriptors exclude inherited evidence. No broad unrelated prototype/runtime immunity claim. Options own-data boundary belongs to PO-5. |
| J5 Primitives/exotics | **Pass descriptor scalar domains.** typeof generation plus Buffer.byteLength on primitive and safe integer checks reject boxes/nonobjects; B verifies. Proxy valid-data trap is an execution seam, not scalar coercion. |
| J6 Mutable intrinsics | **Scoped pass.** getOwnPropertyDescriptor and hasOwn references are captured PO:41–42; existing trusted host model retained for other built-ins. X changes no intrinsic. No arbitrary monkeypatch expansion requested. |
| J7 Serialization/coercion | **Pass fixed descriptor.** Captured primitive generation is byte-measured before use; no wire serialization/hash added here. No selected object can enter terminal descriptor through callback mutation now. |
| J8 Collections | **Pass local bounded shape.** Fixed eight-field array and seven numeric fields; no external array input. Wake snapshot from internal Set is finite per pass and cannot expand (X). Whole adapter metadata/count bounds stay downstream. |

## Retained approval boundaries and next proof

The four prior corrections should be retained. The next source revision needs
to close capture, current-claim acquisition and settlement as one operation,
with the entire callout inventory above covered. Required decisive result:
no terminal callback runs from a stale outer attempt after a nested completion,
while the nested/current successor and ordinary refusal/recovery controls
continue to succeed through this owner.

The current 114/438 assertion and audit results remain exact component
evidence only. Actual MessageRouter shutdown records and full native
Immediate/Promise/transitive graph, adapter allocation coefficients, native
socket/listener transport, cumulative large-row/backlog/replay/ACK witnesses,
and required future OCI/Helm/SEA/npm/source/lab artifact receipts remain HOLD.
No required recovery form is downgraded. Normal startup, BEGIN/activation,
whole-operation memory, FreshMG physical acceptance and merge obligations
remain outside this source-slice approval.

No product source, test, design, metadata, Quest, index, commit or push was
performed by this reviewer. Only this report and D evidence were written.

