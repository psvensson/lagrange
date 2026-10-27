# D1 F2 independent review

**REVISE** candidate `01d214f84b315adb5dd387f19d0e23092c425a50` against approved F1 base `fa85052324778a07cf0067fbfb7bd9cb1ef3028f`. One introduced static regression blocks closure. The reviewed admission, durable application, recovery and drain behavior passed the bounded source/behavior review below. No additional behavioral blocker was found. Positive evidence is retained for applicability review after a narrow correction; this is not approval of an unmeasured successor, whole D1, startup, W7/W9, publication or release.

Independent reviewer: Astra xhigh, `/root/cdc_d1_review`. Reviewer snapshot: `/tmp/session-worktree-D9cNYJ/tree`, made by the repository's session-worktree utility from the clean author candidate. All 17 paths in the author's source manifest match their hashes. The 11 changed runtime hashes are in `identity.json`, with the host, Node and retained-image identity. No production or integration tree was edited, no gate or baseline was changed, and no Quest/receipt/seal was mutated by this reviewer. Rule revision 2026-10-26, steering source `be968204dd298c9da91c3bc99efdfba0e4ea1e1d`; AGENTS, rules, router, runtime/authority owners, relevant verification templates and home-lab policy were read.

## Blocking finding F2-R1: new cognitive complexity in committed application

`src/partition/partition-service-entry-apply-base.js:615`, `applyCommittedEntry`, now has cognitive complexity **22**, exceeding the per-function threshold **20**. Same-host scoped checks report zero violations in these existing touched functions at F1 and one at the candidate. The committed inventory independently records cognitive violations **150 → 151**. This is introduced by the new nested admission branch, not inherited debt. The standalone admission helper and queue are not where this regression occurs.

Evidence: `cognitive-candidate.log`, `cognitive-base.log`, `source.patch`, and `solve/changes/global-owner-debt-inventory/inventory.json`. Reproduce from the exact respective trees:

```sh
node scripts/check-cognitive-complexity.js --scoped src/partition/partition-service-entry-apply-base.js src/partition/partition-participant-transaction-apply.js src/partition/partition-service-core-base.js src/partition/proposal-queue.js
```

The scoped reporting command exits zero while reporting violations; exit zero does not prove a nonincreasing before/after count. `test/guidelines/proof-ladders.md`, Static Guardrail Preflight and Closure items 3 and 5, requires the existing-file cyclomatic/cognitive before/after ratchet and states that a Quest cannot close when a relevant count increased. Composition onto the already tightened cognitive baseline also exposes this debt. The bounded correction is to simplify the committed-SQL application control flow while preserving replay-before-reservation-before-capacity-before-effects and the existing commit/rollback boundary. Do not raise a baseline or merely move the check outside its authority boundary.

Separate inherited debt: the committed inventories report cyclomatic **1766 at both base and candidate**, against the unchanged **1755** baseline. The normal author hook recorded that global overage and refreshed the inventory; it did not make the global guard green. The core constructor/setter's scoped cyclomatic violations remain inherited (52 and 14, threshold 12). The six new JavaScript files pass independent strict cyclomatic and cognitive checks: `new-files-complexity.log`, `new-files-cognitive.log`. No baseline was raised. Global debt remains with the existing owner/integration work; it is not this new finding and is not claimed fixed.

## Source conclusion and bound

The ledger remains the only debt authority. `partition-cdc-owed-admission.js` asks its count owner per decision, not a cache, subscriber registry, queue size or diagnostic census. Ordinary emitting SQL conservatively needs one event; a new PREPARE needs its complete carried operation count. The policy and snapshot/migration exclusions agree with the existing recorder. The immutable D2 recording policy does not depend on node-local subscriber presence.

Both preflight and committed application call the same predicate. Preflight is advisory across concurrency; synchronous application inside the SQLite transaction shared with native applied progress is the authoritative admission boundary. A pressure loser consumes its log entry but creates no SQL effect, settled entry row, generation advance or PREPARED reservation. Its answer is deferred until afterCommit. Later ACK entries continue applying. Durable settled ordinary results and existing participant rows are checked before new-work admission. The candidate did not replace a committed result with a current capacity observation.

For input already within budget, the invariant is `owed + reserved future batch events <= 4096`. PREPARED's existing exclusive reservation supplies the reservation fact; no second count ledger is added. Its operation count bounds possible emitted events, ordinary SQL cannot spend those slots, and ACKs only decrease owed. COMMIT/ROLLBACK do not undergo another capacity test. The real existing 256-operation staging maximum fits; 4097 carried operations receive the named nonretryable impossible-demand refusal. This is not a new supported transaction-size restriction.

An arbitrary retained image need not initially satisfy 4096. The candidate truthfully reports its old debt, excludes new event-producing work and lets retained PREPARED decisions complete. My file-backed predecessor witness demonstrates this rather than silently declaring an oversized prefix valid. Count admission is not a fixed byte, total database, native log or statement-outcome-history bound. Existing completed-hole retention is separately capped; a within-budget ledger may contain owed events plus retained delivered holes and one compact prefix row. Original log/outcome compaction and large-recipient delivery obligations remain separate.

Queue admission uses the existing single queue and hard capacity 1000. Ordinary work, including parked and retained raw-operation custody, cannot consume the unused two ACK slots or unused exact-PREPARED decision slot. A class can use general capacity but cannot take another class's unused reserve. The participant owner first checks bound identity/content; unrelated transactions, unprepared rollback tombstones and late settled decisions do not manufacture drain priority. Duplicate deterministic entry IDs join existing pending outcomes. This is capacity isolation, not a promise of fairness under infinite adversarial arrivals or permanent consensus failure.

The F1 exact-ACK, ledger, pending reconciliation and retained-seed observer files are byte-identical to accepted F1. Its constants file only adds the owed bound. The accepted F1 malicious identity/ordinal/marker and partial/full reconciliation evidence remains applicable; author's current 13-file run also includes obligation/reclamation suites. The original retained-seed observer remains restricted to original foundation histories, not a general interpreter for arbitrary runtime writes or snapshot installation. F2 adds no format, version flag, legacy branch or observer-derived operational permission. No snapshot-install certification is claimed.

## Measurements and failure preservation

| Evidence | Result and limits |
|---|---|
| Independent classified native run | PASS, one file, one runner assertion, 26.559 s. Real RF3 native source commit, leadership transfer term 1→2, production participant release owner, all three replicas at owed4096/applied4100, then reclaimed4096/applied4117, same deferred entry succeeds. `native-independent.log`, `native-independent.tap`. CPU49 C/NVMe68 C; coordinated native window released immediately after exit0/cleanup. |
| Independent classified focused run | PASS, three files/nine runner assertions: real ingress/concurrent-prefix/retry/2 MiB, supported256 PREPARE/restart/impossible4097, parked/crossclass/duplicate/tombstone cases. `focused-independent.log` and `*.independent.tap`. CPU51 C/NVMe68 C. |
| Retained over-budget input, independent | F1 genuinely applies4200 obligations and PREPARE256 into a SQLite file. F2 reopens it, preserves all debt/reservation, admits real COMMIT despite pressure (owed4456), releases the restart fence through the existing owner fixture, refuses new actual executeQuery, answers an old settled ordinary identity, drains4456 through real applied ACKs, then admits the same deferred entry (owed1). `probe.mjs`, `retained-seed.log`, `retained-candidate-attempt2.log`. Original immutable DB `retained-before.db`, metadata `retained.json`. |
| Same retained input on F1 | Behavioral RED at the post-release actual-ingress capacity assertion: extra write is pending/proposed instead of typed capacity refusal. Same SQLite starting image and probe; not an import/setup failure. `retained-base-red.log`. |
| Capacity refusal rollback and replay, independent | At4095, two proposals are admitted. Winner fills4096. An applied-state SQLite trigger aborts the loser's application: applied progress/generation/debt remain unchanged and no committed pressure answer escapes that rolled-back apply. Removing the fault consumes capacity refusal without settling the key; actual ACK drain then permits same-entry success exactly once and replay is inert. `rollback.log`, `probe.mjs`. |
| Same rollback/retry probe on F1 | Behavioral RED: after removal of the same storage fault, the loser becomes `settled` instead of `unsettled` because F1 has no deterministic capacity refusal. `rollback-base-red.log`. |
| Raw queue custody/crossclass, independent | Generic queue policy witness fills ordinary allowance with operations whose responses retired but raw work remains. Both classes retain their reserve in both release/replacement directions; ordinary admission resumes only after actual raw closure; peak6/final0 in a small capacity6 fixture. Candidate PASS; F1 RED because fourth ordinary entry enters. `queue-probe.mjs`, `queue-candidate.log`, `queue-base-red.log`. Production class selection is separately exercised by the full1000-slot focused tests. |
| Exact source/registry | All17 author-manifest hashes match. Independent impact audit PASS71 contracts/44 pairs, digest `1e331866fd6be17f07fbf4ce8c77f0178e9933925e86db3fc17e0f0b0091b487`. `identity.json`, `impact-audit.log`. |
| Reused author cone | Final13 files/295 runner assertions, positive TAP, native diagnostic, predecessor red admission/drain logs, source manifest/receipt and normal hook retained in `reused/`. This review independently reran the four new witness files, not the entire13-file cone. |

The first retained-image attempt expected CDC pressure immediately after restart. The real owner instead returned `partition_write_cutover_paused`: the restart release fence precedes new-write capacity. That is a verifier schedule error/target-not-reached, not a product regression. `probe-attempt1.mjs` and `retained-candidate-attempt1.log` preserve it. The corrected schedule completes the already-PREPARED decision while paused, then uses the existing release owner fixture and tests actual ingress. No production admission flag is mutated. The author's separately preserved first native transfer attempt hit the same truthful outer cutover hold; the final native test uses the real release owner. Neither failed attempt is counted as positive capacity evidence.

The rollback log's `firstAnswer` field is the originally waiting promise's eventual answer after the later committed refusal; the script separately asserts it was not a committed capacity answer immediately after rollback. This distinction prevents reading an eventual pressure answer as evidence that an uncommitted answer escaped.

Reproduction uses `probe.mjs` with `ROOT MODE DIRECTORY`. `seed` runs only on F1 into a fresh directory; preserve that file before running `retained` on each source. `rollback` creates its own in-memory fixture. `queue-probe.mjs` takes only ROOT. The exact source roots used were `/tmp/session-worktree-lpKlgb/tree` (F1, unchanged production) and this review tree (candidate). The baseline negatives exit1; candidate completed probes exit0. The seed database represents real predecessor owner effects, not manually fabricated obligation/PREPARED rows.

Native proof ceiling: real native engine, real local SQLite files, real ordered source application, real release owner and loopback transport on one controller. The receipt subscriber substitutes remote recipient application; the table fixture uses the existing CDC-carrying system-table name with a simplified two-column schema. No physical failure-domain, remote recipient, public fresh-seed, W7, 65-target W9, process-kill or snapshot-install acceptance follows. The measured2 MiB event and source-level absence of new payload/vector limits preserve this repair's count-only claim without pretending to certify those wider obligations.

## Checklist dispositions

Abbreviations refer to exact source in this snapshot: **A** `partition-cdc-owed-admission.js`; **L** ledger count/progress owner; **E** `partition-service-entry-apply-base.js`; **P** participant apply/request/store/bytes owners; **W** raft-write-commit/write-metrics/write-kernel owners; **Q** proposal-queue and CDC-stream pending-write owner; **R** `retryable-control-plane-write.js`, control-plane error classifier and `query-executor-unknown-outcome.js`. **N/F/I** denote native, focused and independent probe artifacts above. PASS is bounded to this F2 review; SOURCE is inspected evidence, not a new physical test.

| Admission/gating item | Verdict and evidence |
|---|---|
| 1 Same precheck/enforcement | PASS A/E/P/W: same current ledger predicate; F concurrent two-proposal witness proves apply rechecks and replicas agree. Preflight is not a reservation. |
| 2 Transient/terminal | PASS A/W/R/F: temporary capacity has typed code/deferRetry and existing retry classification; impossible4097 is nonretryable. Durable prior outcomes win. |
| 3 Existing wait budget | SOURCE R/Q: no new wait owner; existing30 s default control-plane deadline,100→1000 ms exponential delay, queue commit deadline. No raised budget. |
| 4 Reason shape | PASS F/R: structured failureCode/deferRetry used by owner; text-only retry fragment added only for temporary capacity. Prior unknown outcome is not replaced by refusal. |
| 5 Hold release | PASS N/F/I: applied CDC_DELIVERED lowers durable owed, then same entry progresses. Independent retained image proves old PREPARED completes too. No cache publication is required for capacity read. |
| 6 Freshness | PASS A: no memoized debt; synchronous durable count at every admission, apply inside transaction. |
| 7 Message honesty | PASS A/I: refusal refers to this attempt, entry and partition; no claim prior uncertain attempt did not commit. Retained excess remains observable4456. |
| 8 Useful progress/bounds | PASS N/F/I separately: no new effect at bound, useful retry after drain, finite count from valid prefix and existing queue bound. Fixed bytes and arbitrary retained prefix bound explicitly not claimed. |

| Recovery/replay item | Verdict and evidence |
|---|---|
| 1 No stale projection overwrite | PASS A/L/P/I: authority is durable count/PREPARED/outcome. Restart retains4200+256; no count reset or cached reservation introduced. |
| 2 Restart/live distinction | PASS I/P: reopened origin/PREPARED rows survive; existing restart release fence is respected. No new live registry replacement. |
| 3 Previously owed coverage | PASS F/I and reused F1: no subscriber/current empty registry deletes debt; refusing subscriber creates full debt, source-known receipt/ACK path drains it. Transaction enlisted registry is outside this delta. |
| 4 Partial-effect replay/rollback | PASS E/P/I: failed applied-state transaction emits no committed refusal; retry key remains unsettled under pressure, later applies once. Settled results precede capacity. |
| 5 Absence/unreadability | SOURCE A/L: SQL read errors propagate, not zero/success fallback. Legitimately nonexistent ledger means no recorded debt under unchanged ledger contract; arbitrary corrupt/deleted ledger or snapshot provenance is not certified as empty. |
| 6 Useful recovery | PASS I/F/N: actual file restart, PREPARED completion, ACK drain and same identity retry. Fault assumptions: readable durable state returns, consensus and receipt delivery progress; permanent unavailable storage remains explicit failure, not completion. |

| Concurrency item | Verdict and evidence |
|---|---|
| 1 Atomic boundary | PASS E/P/I/F: same SQLite application transaction as native applied progress; neither async preflight nor volatile queue claims durable capacity. |
| 2 Await gaps | PASS W/A/E: any race after preflight is resolved again in committed apply; before effects no await. Queue registration/class selection is synchronous; later settled participant row only makes a late decision an idempotent result. |
| 3 Single winner | PASS F/I: concurrent winners/losers identical on leader/follower; settled entry key and durable participant state prevent duplicate effects. |
| 4 Timers/reentrancy | PASS F/I/Q: timers retain existing entry ownership, bounded queue and identity joins; source ACK timers coexist with admission refusal. No new timer/state machine. |
| 5 Key scope | PASS A/P/Q: per-partition DB and queue; exact transaction/participant row and digest select decision reserve. SQL callers cannot select drain class. |
| 6 Uncertain custody | PASS F/I/Q/R: duplicate joins, raw-operation retention until actual closure, pending deadline typed release; prior lost-answer provenance remains unknown. No growing second queue. |

| Retry-loop item | Verdict and evidence |
|---|---|
| 1 Fires/typed stop | PASS F/R: existing retry owner invokes same identity after source ACK progress with no fresh external write. At budget it returns last typed answer or unresolved outcome through the caller owner. |
| 2 Bound with unreadable state | SOURCE R/Q: deadlines are captured before attempts and do not depend on reading the debt row; read failure cannot reset them. No new polling loop. |
| 3 Observable exits/logging | PASS A/W/R: admitted, temporary capacity, impossible demand, existing queue backpressure, known terminal/committed answer and unknown/deadline remain distinct. Existing spent-wait reporting remains. |
| 4 Mutual suppression | PASS N/F/I: refused SQL does not block committed-log advancement; ACK/decision reservations remain available under parked ordinary pressure. |
| 5 Attempt/log ceiling | SOURCE R: default zero-cost attempts with100,200,400,800 then1000 ms delays spend30 s in at most34 calls per invocation; owner-specific options may be shorter/different. No new global bound over unlimited callers/outage duration is claimed. Existing queue max1000; ACK outstanding max2. |
| 6 Late-success duplicate effects | PASS I/E/P: same entry after completion returns recorded result/replay and adds no generation/debt. |
| 7 Reset semantics | PASS R/L: capacity/transport refusal does not settle earlier unknown work; ACK receipt alone cannot alter durable owed count. Existing unknown-outcome witness consumes the real pressure answer. |
| 8 Finite failure clears | PASS F/N/I: useful same-entry retry after drain; admitted old PREPARED remains durable across shutdown/reopen. Caller deadline does not erase owed ledger or participant row. |

| Owner-interaction item | Verdict and evidence |
|---|---|
| 1 Single question owner | PASS A/L: capacity decision owns demand plus owner count; diagnostics/subscribers do not adjudicate it. |
| 2 Typed boundary | PASS A/E/P/W: intent, count evidence, refusal and committed settlement have explicit owners. Exclusive PREPARED state is reused, no second permit store. |
| 3 Paired invariants/control | PASS I/F: bound/no effects plus ACK/decision progress in same schedules. Exact F1 controls fail the named admission/settlement/queue assertions. |
| 4 Stale then fresh | PASS F/I/N: full prefix first refuses, actual committed ACK progress then admits same entry. No cached veto. |
| 5 Pressure/backoff | PASS A/Q/R: no general internal-priority escape; only exact drain classes, existing retries and hard total capacity. |
| 6 Wake/release | PASS F/N/I: lane ACK timers/afterCommit and existing retry owner continue; participant decision readmits parked writes through canonical write owner, with apply recheck. |
| 7 Projection authority | PASS A/source search: count owner read only; census and metrics never supply permission. F1 observer unchanged. |
| 8 Control fidelity | PASS identity.json/I: same source-bound probe on exact predecessor/candidate, same preserved DB for retained control. No expected-negative added to positive native population. |
| 9 No escape hatch | PASS changed-call-site review: same preflight/apply predicate, unchanged command-origin admission, no legacy/version fallback, raw SQL debt counter or alternate scheduler. |
| 10 Contract/registry/proof | Behavioral PASS: Quest/design count-only contract, registered delivery-pair helper and four live witnesses, impact audit71/44. Closure REVISE only for F2-R1 required static ratchet. |

| Transport/delivery item | Verdict and evidence |
|---|---|
| 1 ACK versus processing | SOURCE/PASS N ceiling: source debt changes only at applied CDC_DELIVERED; subscriber is an explicit receipt double, not remote-native acceptance. F1 receipt/admission semantics unchanged. |
| 2 Late responses | PASS Q/R/I: queue/raw custody retained until closure and unresolved prior attempt cannot be settled by later pressure. Wider remote late-honor routing unchanged. |
| 3 Classification | PASS F/R/W: temporary failure enters canonical typed/text retry classifiers; impossible demand does not. |
| 4 Undeliverable bounds | SOURCE, no transport changes: existing query/commit budgets and typed unknown remain; permanent remote fault not newly measured. |
| 5 Stub fidelity | PASS with ceiling: controllable consensus is declared; native test uses real native group and loopback transport; receipt is built by established owner fixture. |
| 6 Effect/obligation continuity | PASS I/F/N: retained debt and exact identity persist through restart/refusal; actual source ACK application releases capacity. Remote65-target W9 remains open. |

| Harness-fidelity item | Verdict and evidence |
|---|---|
| 1 Behavioral red | PASS independent retained/rollback/queue controls and author red logs. First restart schedule is explicitly excluded as target-not-reached. |
| 2 Binding substitutes | PASS with declared ceiling: real PartitionService/SQLite/admission/application/proposer; controlled port for deterministic ordering, receipt fixture for recipient; native source engine separately measured. |
| 3 Time ordering | PASS F/I: no production constants changed; explicit proposal→winner→loser, rollback→retry, restart→retained decision→release→capacity→drain→retry order. |
| 4 Complete owner fields | PASS F/I: predecessor-created DB and owner-built PREPARE/COMMIT/ACK/stamps. Full supported256 staging is real. No fabricated durable rows. |
| 5 Nonvacuity | PASS:4096 source events over repeated rows,4200 retained+256 PREPARED, nonempty pending/raw queue, actual refused extra operation,2 MiB event inspected. |
| 6 Real entry | PASS F/N/I: executeQuery, participant request owner, committed application and CDC proposer/drain; injected generic queue probe supplements the full1000-slot production-path witness. |
| 7 Evidence ceiling | Explicit above: one controller, real native source/local storage, loopback/receipt substitution; no remote/native recipient, physical crash or whole startup certification. |
| 8 Failure/progress accounting | PASS: all first reds retained; fixture outer hold distinguished; safety/progress/count/bytes separated; static candidate regression is not relabeled inherited. |

Sweep/formation/adversarial-intrinsics templates are not separate changed categories: this delta adds no periodic detector, new formation authority or hostile-JavaScript guard. Existing timer/release interactions are nevertheless covered in concurrency/retry/native evidence. No exemption is inferred for a reachable source defect.

## Historical and primary-source checks

Project history inspected includes `f5d5381397376dec8ffbdeb73eb88f20f3e55b0f` (may-have-committed outcomes remain unknown and committed results survive side-effect failures), `0ffd3a1ec` (exclusive PREPARED reservation and parked writer custody), and `681da1dc1beb5728a52ee5d223113b71b423156b` (raw-operation queue lifetime). These explain why capacity refusal must not settle prior uncertainty, why a decision must keep completion capacity and why retired responses still charge the queue. Current source and measured controls, not historical summaries, decide the verdict.

CockroachDB's primary [replication admission design](https://github.com/cockroachdb/cockroach/blob/master/docs/tech-notes/replication_admission_control.md) identifies head-of-line blocking and priority inversion when a follower waits below an immutable Raft log order. That motivates checking that refused work is consumed and later ACKs apply here; its token design and broader fail-open choices are not adopted. etcd's primary [maintenance/quota documentation](https://etcd.io/docs/v3.6/op-guide/maintenance/#space-quota) preserves draining operations under quota and warns that an API quota error can coexist with backend success. That motivates both drain reachability and preservation of earlier unknown attempts; it is not evidence for this implementation's refusal guarantees. Each local claim above has local source/behavior evidence.

The consolidated review surface is complete at01d214. Root owns the F2-R1 correction, frozen successor and review continuation. There is no remaining reviewer native or test process and no production self-repair for approval.
