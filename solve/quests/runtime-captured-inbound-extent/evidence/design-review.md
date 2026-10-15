Read-only audit supports the minimal correction, subject to content-bound review and native controls. No files changed or tests run.

Baseline: `a7e821154f1039df82bfc73ef4f2e25e4fa0468d`, branch `review/runtime-captured-inbound-correction-20261015`. Runtime-owner SHA256: `a560a052bf9b470a2046009555162b60669c340d86274fca9c74126fc8fbd01b`. Worktree was initially clean; the only subsequently observed addition was the root-owned narrow Quest.

Use one private helper returning the existing typed generation refusal or `null`. Both `invokeCoreAt()` and `drainInbound()` should consume that helper. Preserve `invokeCoreAt()` enforcement after the local-log guard. The drain check belongs before every dequeue and before an empty/exhausted continuation.

Capture the finite count once after successful `ensureExecution()`. Decrement for every consumed occurrence, including ordinary local and native refusals. Keep remaining envelopes in `group.inbound`; do not detach a batch or cap the initial extent at one.

The existing wake path supports leaving scheduling unchanged: an ingress wake either remains armed, transfers to a FIFO `DRAIN_INBOUND` turn, or becomes shared-runtime wake debt. A false `inboundDrainScheduled` flag alone does not imply abandoned work. Unconditional completion rearming would introduce retry-budget and lifecycle hazards.

Concrete finding requiring a distinguishing control: baseline `drainReady()` calls `announce()` on its no-Ready path and then returns `CORE_OK` (`raft-rs-runtime-owner.js:1201`). `announce()` silently returns when its guarded status call fails (`:1260`). For captured `[e1,e2]`, a core-fatal status during e1’s final announcement can therefore reach the next drain recursion while unhealthy. Baseline shifts e2 before refusing native entry. The proposed pre-dequeue guard must leave e2 queued. W07’s replacement during an awaited send ordinarily exits earlier and does not distinguish this edge.

Completion and failure obligations:

| Exit | Required preservation |
|---|---|
| Execution admission/recovery refuses | No capture and no dequeue; preserve existing retry classification. |
| Captured extent finishes | Invoke the selected command once; late inputs retain their existing timer or queued drain. |
| Ordinary local/core envelope refusal | Record that envelope’s refusal and continue through the entire captured tail. |
| Local-history reseed hold | Preserve existing terminal hold and lifecycle retirement; no new rearm. |
| Core/Ready/application failure | Return the owner’s typed failure; leave unconsumed queue entries attached to the group. |
| Generation change or close | Refuse before dequeue and continuation; do not mark the replacement failed. |
| Persistence wait expires | Preserve the existing bound and queued bytes; do not manufacture a fresh wait budget. |
| Unexpected throw | Preserve operation-port containment and group-scoped recovery. |

Category-complete source/proof map follows. `R` means `src/raft/raft-rs-runtime-owner.js` at the pinned baseline.

- **Concurrency 1–5:** (1) synchronous ownership is `enqueue`, R:961–986; (2) generation revalidation is R:394–407 and must additionally precede dequeue; (3) commands and wakes share that same queue, R:1818–1823; (4) nested observers remain gated by `entered`/`tail`, R:941–947 and :1433–1450, covered by CA5; (5) ownership is the exact dispatcher group, including unique `group.key`, R:1858–1908—not logical-name lookup.
- **Recovery 1–5:** (1) retain the live inbound array during reconstruction, R:877–906; (2) shared replacement, group recovery and fresh opening remain distinct, R:275–296 and :920–935; (3) no TX enlistment state changes—do not interpret an empty inbound queue as durable completion; (4) preserve committed replay/application ownership, R:1071–1133 and `operation-port-ready-recovery.test.js:172`; (5) unreadable durable progress remains explicitly unreadable, R:195–207. New native evidence must show retained input reaching the canonical recovered generation.
- **Transport 1–5:** (1) ingress `inbound-enqueued` is acceptance, not processing, R:1945–1982; (2) late Ready completion retains generation fencing, R:1136–1188; (3) existing per-peer delivery and envelope-refusal shapes remain unchanged, `raft-rs-peer-delivery.js:44–99`; (4) finite extent does **not** bound an unresolved send Promise—the existing transport owner supplies delivery completion; (5) witnesses must use actual native messages/replies and existing delivery seams, as frozen W07 does.
- **Timer 1–5:** (1) use the captured clock and exact timer record, `raft-rs-inbound-timer-custody.js:7–51`; its referenced accepted-work timer intentionally supersedes the generic unref guidance; (2) `DRAIN_INBOUND` is not a tick/campaign, R:1604–1605; (3) do not introduce recovery-side queue replacement or dedup state; (4) preserve persistence and recovery windows, R:1776–1794 and :836–905; (5) busy callbacks enqueue through the owner rather than recursively drain, R:1796–1824.
- **Harness 1–6:** (1) retain frozen W07’s semantic assertion and exact test bytes; (2) no fabricated authoritative responses; (3) no timeout or scheduling compression changes; (4) retain complete native envelope identities and bytes; (5) explicitly exclude the `before <= 1` zero-step loophole with a capture-point control; (6) bind candidate/negative results to actual core entries, native replies, commands, source fingerprints and raw evidence. These remain required executions, not results of this audit.
- **Owner interaction 1–10:** (1) runtime owns turn extent; (2) lifecycle admits entry, native core owns consensus results, timer owner owns its handle; (3) same-trace command service **and** accepted-tail preservation are required; (4) stale continuation must fail while later current-generation service succeeds; (5) retain existing backoff and wait bounds; (6) demonstrate a consumed-busy wake’s queued continuation without an extra driver; (7) status observations and test observers grant no permission; (8) preserve source-revert and incorrect-capture negatives separately; (9) no new raw entry, queue, scheduler or retry loop; (10) update the existing contract/registry alongside semantics. Existing registration is `impact-contracts.json:599`; do not mislabel W07’s ordinary test registration as a named coupled-pair witness.
- **Admission 1–7:** (1) share the exact native-entry predicate; (2) retain existing typed transient generation failure, R:394–407; (3) add no wait or enlarged budget; (4) return the existing outcome shape rather than reconstructing reasons; (5) recovery and persistence release through existing owners, R:630–665 and :1776–1824; (6) evaluate current generation/health before each dequeue and continuation; (7) retain actual group/replica identity in reports and refusal observations.

The necessary proof cone is frozen W07, explicit after-admission capture, busy-wake remainder service, the pre-dequeue fault edge, CA1/M9/CA5, owned timer custody, persistence admission, Ready recovery, unexpected-throw containment and exact-generation lifecycle controls. Include a mutation capturing too early and the identical-test baseline source negative.

This approves the bounded implementation direction, not candidate source or general liveness. Finite captured extent does not establish queue capacity, finite delivery latency, crash persistence of inbound messages, or the complete release protocol.

<oai-mem-citation>
<citation_entries>
MEMORY.md:38-38|note=[Exact evidence and ownership review discipline]
</citation_entries>
<rollout_ids>
01a134b7-914d-7b31-a33c-09ea3a047bec
</rollout_ids>
</oai-mem-citation>

---

Content-bound design addendum, 2026-10-15. The text above preserves the completed audit verbatim; "No files changed" describes that original read-only pass. This review document is the sole file subsequently created by this reviewer.

Reviewed file: `/mnt/data/peter/projects/.worktrees/runtime-captured-inbound-correction-20261015/solve/quests/runtime-captured-inbound-extent/DESIGN.md`.

Reviewed SHA256: `19321afb6a4f95ddaf3361d3c0b47429cdbd98093703945234e9ef824df507f3`.

The design faithfully selects the shared typed guard, capture after successful execution admission, retained authoritative inbound array, per-occurrence refusal semantics, guard before the identity-unrecorded cleanup and exhausted continuation, and no new wake/rearm path. Source and native-test acceptance remain pending.

One documentation precision finding: the reseed row says the owner "records the durable hold". `src/raft/raft-rs-runtime-faults.js:46–90` establishes the hold immediately in memory but may defer its durable recording when persistence is unavailable, or retain a failed-recording obligation for the next canonical operation/delivery. Prefer "retains the existing immediate hold and durable-recording obligation". This is an existing-owner qualification, not a request to alter reseed behavior.

The proposed pre-dequeue announcement-failure control remains a source-backed proof requirement, not an executed counterexample. Acceptance during reconstruction is still explicitly conditional on an existing observable seam. No missing-symbol, setup or timeout failure may be substituted for either semantic witness.

Static evidence attribution: the root reports the unchanged global lint baseline red with 85 findings and aggregate complexity 1788 versus 1755; touched-runtime lint/literals/grammar clean; inherited runtime size 2063 lines, two cyclomatic, one cognitive and two decision-boundary findings. This reviewer did not rerun those commands. The explicit user restriction against unrelated extraction limits this packet, and the design does not claim terminal landing or resolution of inherited debt.

The libuv paragraph is an architectural analogy, not a Lagrange ownership or native-proof premise. This audit does not independently certify that external reference.

Stop boundary: design/seam audit only. The source correction remains subject to separate exact-content independent review and measured native evidence. The complete release successor remains unsealed/unactivated, shared-control-wave HELD, Runner/TAP PARKED, and PR #122 and bde70cec remain rejected.

Final design addendum: the root corrected the reseed sentence to "retains the immediate hold and its durable-recording obligation". Independently reread that line and recomputed the final DESIGN.md SHA256 as `1a122e71d184efba30e857d61a1ad0b23f5c06a4c2a85da5aeaf032d1675232f`. The documentation precision finding above is resolved at this exact content. Direction/seam verdict: APPROVE the bounded design for implementation and subsequent independent verification; no source or test-result approval is implied.
