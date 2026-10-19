# Rs-raft U1 systemic-defect review — 2026-10-19

**Status:** Investigative evidence / proposed verification discipline. NOT an owner-contract supersession, source approval, revised oracle approval, U1 closure, or merge authority.

**Parent:** `raft-rs-full-cutover` epic, `wasm-creation-genesis` quest.
**Scope:** Distinguish systemic owner/interaction defects from demonstrably local fixture failures, based on repository history and external distributed-systems practice. Preserve all rejected attempts and fixed exact-source evidence.

## Operator direction

**Treat any newly observed bug or failing test as a possible *systemic* defect until there is evidence that the failure is local.** Local here means not merely that one assertion fails, but that the relevant owner and its coupled consumers have the same approved facts, ordering, retry and recovery semantics, and that independent negative controls exclude the corresponding general defect.

This restates the existing architecture principles, especially R01–R05, R09–R14 and R18–R23, and [authority-and-recovery](../../../../../architecture/contracts/authority-and-recovery.md). It adds no new authority. Never update a sealed contract or a test expectation simply to match a newly observed return value.

## Historical regression archaeology — precedent, not proof of today's code

| Historical incident | Exact evidence | Systemic lesson and U1 counterpart |
| --- | --- | --- |
| Leadership projection versus source-of-truth columns, with **five interaction-blind fixes** | [d5e18ea3](https://github.com/psvensson/lagrange/commit/d5e18ea3f0d5826d3151444e9a3cb882209699b3), [owner decision table](../../../../../docs/specs/decision-tables/leadership-authority-projection.json) | Multiple writer/reader interpretations produce repeated apparent regressions. Fix the interaction and migrate consumers; do not restore an old projection as new authority. U1 analog: selection, journal, physical custody, services-row projection, memo and handler each have distinct roles. |
| Dropped-wake transport behavior and ambient owner clock after rs-raft landing | [154628ee](https://github.com/psvensson/lagrange/commit/154628eed689a5e42dcc3187c40c565230db0941), [release proof #4 classification](../../../../../solve/epics/raft-rs-full-cutover/quest-records/replica-lifecycle-durable-generation/release-proof-4-classification-2026-09-30.md) | A transport change made the `noHandler` recovery branch unreachable; a constructor read `Date.now` instead of the injected deterministic owner clock. Prove each wake/ack class reaches the continuation, and the actual clock's owner controls budgets. U1 analog: pre-hydration wake and retirement re-drive. |
| Parked self-move falsely stale-failed after about 30 s while a 35 s incumbent was making legitimate progress | [50520f6b](https://github.com/psvensson/lagrange/commit/50520f6b5ccfcf74af77746c6ef9751bf0b76fbd) | Timer expiry cannot decide whether an acknowledged obligation has ended; distinguish documented parking/progress from inactivity. U1 analog: REMOVE held while physical custody, STOPPED projection or journal completion remains owed. |
| CI `TAP_TIMEOUT` overwrote a larger file-specific timeout | [5fc691e4](https://github.com/psvensson/lagrange/commit/5fc691e46bf3035923f74093ad824d72ebe216fc) | Diagnose the runner configuration/clock before increasing a test budget or labeling a slow owner incorrect. U1 analog: “did not settle within declared rounds” must expose the first incomplete owner transition. |
| Reentrant async diagnostic-hook activation left singleton ownership dirty until explicit rollback | [3b27482c](https://github.com/psvensson/lagrange/commit/3b27482c6641e04a409b651b82767e0bdc08cda6) | Post-await/throw paths are part of the owner contract; a callback may fail after an apparently successful partial transition. U1 analog: shutdown, later successor, and late physical/journal callbacks. |
| Half-open transport kept a stale endpoint forever without pong tracking | [a8203f9f](https://github.com/psvensson/lagrange/commit/a8203f9fd7413400aa4a45d1f7e4a5b21bec218a) | Observation of “socket open” is not current peer liveness. Fencing must be paired with eventual authorized reconnection. U1 analog: held memo, current generation, stale continuation and wake validity. |

The archaeology shows **recurring defect families** (competing authority, lost continuation, stale progress inference, owner clocks, post-await lifetime, and misleading fixture outcomes). It does **not** establish which of these is the current U1 root cause without an exact measured witness.

## External systems — patterns to evaluate, not features to copy

1. **Kubernetes controller-runtime:** reconcile from current desired/actual owner state, not one-off event-type behavior; idempotent full reconciliation handles coalesced/missed events. [controller-runtime FAQ](https://github.com/kubernetes-sigs/controller-runtime/blob/main/FAQ.md), [controllers](https://kubernetes.io/docs/concepts/architecture/controller/). **U1 application:** a wake may be a hint, but a lost wake must still leave a discoverable, owner-retriable obligation. This does not license a second reconciliation owner.
2. **Kubernetes finalizers:** deletion is not completion; the object remains terminating until cleanup obligations clear. [Finalizers](https://kubernetes.io/docs/concepts/overview/working-with-objects/finalizers/). **U1 application:** distinguish physical STOP/retirement, STOPPED projection, resource slot CLOSE and the *original CREATE journal* completion. A successful callback is not finality.
3. **Temporal:** a durable event history drives re-entry after crash; history is authority, volatile executor state is reconstructed. [Event History](https://docs.temporal.io/encyclopedia/event-history), [Tasks](https://docs.temporal.io/tasks). **U1 application:** preserved creation identity and original journal obligation must survive crash, uncertain acknowledgment, and successor selection; a handler memo does not replace them.
4. **etcd/raft:** Ready/Advance requires durable state and ordered application; external transport/storage are explicitly the embedding application's responsibility. [raft library](https://github.com/etcd-io/raft). **U1 application:** keep ordered Raft facts distinct from service journal and physical custody; “sent,” “accepted,” “applied,” and “durable” are not interchangeable.
5. **FoundationDB:** deterministic simulation plus injected delays, failures, process restarts and virtual clocks exposes rare cross-owner failure sequences, while real-hardware tests remain complementary. [Simulation and Testing](https://apple.github.io/foundationdb/testing.html). **U1 application:** use labelled post-await and crash-cut witnesses over actual owner interfaces, then confirm the same invariant on lab machines.

## Mandatory defect-analysis sequence for the remaining U1 gate

For each failure, *before* editing production or a test:

1. **Freeze** the exact candidate commit/tree, original untruncated error, test runner version, host, failure phase, and the first observed red. Mark original evidence immutable.
2. **Archaeology:** search previous quest logs, Git commits, decision tables and earlier failures for the *same invariant* and *same coupled owners*, not just the same filename.
3. **Trace one interaction:** trigger → durable authoritative facts → identity/generation → allowed action → durable commit or current observation → lost-answer/restart behavior → remaining obligation → lifetime/release owner.
4. **Expand the failure surface:** identify every other caller, recovery trigger, memo/row projection, watcher, restart path and consumer that relies on the same decision. A narrow failure becomes local only when these paths are demonstrably unaffected.
5. **Separate safety from liveness:** proof that a stale action is rejected does not prove a legitimate current action eventually re-enters. A green retry test alone does not prove old-generation exclusion.
6. **Prove fault variants:** before/after await, lost reply after apply, duplicate same identity, conflicting duplicate identity, crash after each durable transition, shutdown/restart, new successor, late callback, unavailable owner, and real elapsed-budget accounting.
7. **Conclude with evidence classes:** `SYSTEMIC_CONFIRMED`, `LOCAL_PROVEN`, or `UNRESOLVED`. A local verdict needs a red-on-source-revert/green-on-fix proof with unchanged authority assertions, plus checking sibling interactions. Keep UNKNOWN where causality or scope remains unproved.
8. **Independent approval and exact-SHA execution** precede landing. A new green modified test is only an observation until its oracle is independently confirmed; do not borrow an old SHA's pass for a new tree.

## Current U1 classification (as of this note)

| Exact observation | Systemic hypothesis and proof still needed | Disposition |
| --- | --- | --- |
| [#318](https://github.com/psvensson/lagrange-lab/issues/318) at `d04dab16`: creation-intent file passed, bound route file had six failing leaves | The route combines inbound request identities, retained origin, in-flight gate and memo; prove same-ID/foreign-ID paths from *actual ingress*, not a synthetic internal call only. | Source acceptance OPEN |
| [#328](https://github.com/psvensson/lagrange-lab/issues/328) at `39b09b1f`: 1/3 files passed, 12 failing leaves across routing/restart; creation-intent passed again | Trace wake hydration, recovery re-drive, terminal/retirement, and journal duplicate-conflict behavior across owner boundaries. | Source acceptance OPEN |
| [#344](https://github.com/psvensson/lagrange-lab/issues/344) at `265d1a95`: **PASS 1/1 routing test file, 63 assertions**, but commit changes *only* `test/node/runtime-service-bound-route.test.js` (+29/-9) | This is **not a product-source fix** and must not override old failed oracles. Independently judge the modified direct-route entry, pre-hydration wake `RECORDED → NO_LOCAL_OPERATION`, terminal `FAILED → REMOVED`, and re-entry count expectations. Especially compare with previously proven dropped-wake regression [154628ee](https://github.com/psvensson/lagrange/commit/154628eed689a5e42dcc3187c40c565230db0941). Preserve branch as evidence; do not count as U1 green. | Test-only investigative pass; oracle review REQUIRED |
| R2-E malformed scan row versus same-operation conflicting duplicate | An unrelated malformed row may yield its own typed failure *without suppressing a valid row*. Two different durable observations of the **same operation ID** must never allow arbitrary choice of a winning mutation. Prove total scan and fail-closed conflicting duplicate separately. | Exact `39b09b1f` still integrated RED; owner verdict OPEN |
| Restart P-R7, P-R11, P-R12 | Collect per-step exact committed-state receipts and reason about hidden wake/debt. No increase of “rounds” or timeout without measured phase diagnosis. Prove actual eventual continuation after restart. | High-priority systemic investigation |
| Missing original final-correction commit previously described as `60709700` | Remote does not substantiate it; preserve published WIP/accepted source review, reconstruct only exact approved mechanisms, no invented pass. | Unresolved preservation gap |

**Current proof ceiling:** #344 is evidence that *changed test expectations* pass, not proof that U1 was correct. The original #318/#328 failures are still relevant. F1's earlier isolated negative controls and reviews do not clear F2–F6 or the full end-to-end gate.

## Proposed next investigative actions (within existing sealed Quest)

- Recover the exact owner source and rejection history for the six routing/restart categories. Independent reviewers classify every changed assertion in `265d1a95` against the current, source-owned contract; restore an old assertion unless its supersession is documented and its replacement proves the same safety/liveness property.
- Preserve an original-unmodified red oracle for pre-hydration wake and potential dropped continuation. Prove one of: (a) an admitted current entry receives the wake and progresses; or (b) the durable operation necessarily triggers its existing bounded recovery regardless of a missing wake. Neither “NO_LOCAL_OPERATION” alone nor an indefinite hold proves the latter.
- Instrument source-owned progress transitions in P-R7 and P-R12 before interpreting timeout or terminal states. Read commit points, local custody and journal separately; test loss of acknowledgments, no duplicate effects, surviving obligations and successor exclusion.
- Only after independent review of source **and** original or superseded oracles: freeze one combined SHA, run all eleven files (including post-await custody and negative controls), verify source-only red-on-revert mutations and perform integrated multi-host proof. No U2, activation seal or `main` merge until U1's recorded gate is truly satisfied.

**This file is a durable research/handover attachment, not executable certification.** Historical analogies are research hypotheses; only exact-source, exact-owner evidence decides Lagrange behavior.
