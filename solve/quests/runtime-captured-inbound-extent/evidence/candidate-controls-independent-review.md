# Independent candidate controls and staged-negative review

ACCEPT the two recorded candidate whole-file runs as native evidence for their bounded runtime predicates: frozen W07 4/4 PASS and companion 4/4 PASS. APPROVE the three exact staged source mutations below for their already specified first negative runs. No negative result or general production/release certification is claimed here.

Reviewer: subagent:/root/native_witness_verifier, 2026-10-15. No tests were run or rerun by me; no production/test/evidence inputs were changed. I read all eight event payloads, checked source identities and independently derived the summary.

## Candidate identity and execution

Candidate commit: 4aa8780cfec6f2718b86b4d1e27ee9711492be59.
Runtime SHA256: b47951f39c6a5e7b93670a3a730115b3993976e808ec2e7d76598ade270dbc0f.
Unchanged test identities:
- W07: 07f9cd3a396b1036f96e2130efa454f1702b7acc6ad7e45b14274c5c3a3bce8d; frozen blob debc16f442ba63b100332d93b285865d36d1c376.
- Companion: 9cb552e83ef5fcdcc1ab0248961b7e2b9f14961542b3c1178fad3a95b8d2c1ff.
- Companion helper: 4ac1dce5cc8bb72de533055b03ea892fb212fbd24d16b586edac21243fdc014e.

Evidence root: /tmp/lagrange-runtime-correction-20261015/candidate-controls.
Each plan and run.log names the exact candidate, lenovo-laptop and one whole file; each placement reports retry:0 and exit-code.txt is 0.
- 01: W07, 4 PASS / 0 FAIL, classified 3376ms; TAP duration 2820.771681ms.
- 02: companion, 4 PASS / 0 FAIL, classified 2989ms; TAP duration 2513.804148ms.

The automatic placement calibration differs (factor 2.7 and 2.3); inherited TAP_TIMEOUT is null and test/native clock constants are unchanged. No timing-performance comparison is inferred. These are one-host RF3 fixtures, not a physical three-host cluster.

Successful run.log files contain the classified summary rather than full TAP. The reviewed external controller run-group-capture.mjs:61-101 performs one runLabTest call per requested file, captures the returned raw relay without rerunning, and preserves/restores any prior controller relay in finally. Raw TAP is separately retained. I therefore do not claim successful raw.tap appears verbatim in run.log.

## Native event findings

| Witness | Observed mechanism and limits |
| --- | --- |
| W07 quiet | Predecessor propose 584, selected 593. Both typed CORE_OK/drained, zero inbound before selected, fixed bound one. Actual selected native forwarding is present. |
| W07 suspended old generation | First input steps at 1112 in generation 1. The precreated RF1 trigger's two owned ticks cause a real four-group replacement to generation 2. Old invocation returns HOST_FAILURE/runtime-generation-changed and selected never proposes. The retained second heartbeat then steps at 1160 in generation 2 and emits the second real reply. |
| W07 native per-message refusal | Native removed-peer response steps at 1770 and valid forwarded tail at 1774, before selected propose 1783. Exact post-measurement refusal is CORE_REFUSED, phase step, peer-not-found, refusalCount=1. Actual durable tail row index 4 precedes selected row index 5, with exact command bytes, one row each. A handled per-message refusal does not terminate the captured preaccepted tail. |
| W07 finite recurring input | Four accepted copies, four exact native steps and four native replies. Step sequences are 2399,2417,2426,2435; selected proposes at 2408. Exactly one inbound entry precedes selected, matching the preselected bound one. Every held send is released, selected output itself is unheld, and all bytes are preserved. |
| Companion two-message admitted extent | Both inputs arrive after selected enqueue. Steps 639 and 648 and their replies precede selected propose 657. This rejects interpreting the one-arrival W07 bound as a global one-message capture cap. |
| Companion consumed wake | h1 steps at 1327; the late h2 is accepted during its Ready wait. The actual owned timer reports callback and turn-request while that wait persists. After the final external send release, selected proposes at 1336 and h2 steps/replies at 1345. This is the required h1 -> selected -> h2 order with no subsequent message, clock advance, status/read rescue or manual tick. |
| Companion guard before destructive removal | Two inputs accepted. h1 steps at 2026 generation 1. The explicit final-status fault returns typed HOST_FAILURE/runtime-generation-changed. In the separately marked recovery phase, real three-group replacement occurs; retained h2 steps at 2055 generation 2 and emits its reply, followed by the explicit recovery tick at 2064. Selected never enters. This is preservation across failure with explicit recovery, not autonomous service. |
| Companion after ensureExecution | Actual application host failure records applied=2, committed=3. Real free/create_node/persist_ready reconstruction reaches the SQL hold. A heartbeat is accepted while ensureExecution waits, then steps at 2885 and replies before selected propose 2894. Exact final result CORE_OK/drained, applied=3, committed=3, markerCount=1; selected forwards once. |

The first baseline companion's late-order RED and pre-dequeue-loss RED both reach their intended GREEN predicates in the same unchanged test file. No callback was used to manufacture authoritative success. The explicitly injected faults are declared seam faults; subsequent runtime replacement and typed outcomes are real owner behavior.

Passive-interval check: the quiet, pressure, refusal, queued-capture, consumed-wake and reconstruction diagnostic sequences contain no native tick. W07 replacement contains only its two declared RF1 trigger ticks. Companion guard contains only its declared later recovery tick. Source-identical witnesses prohibit external status/settle/deliverAll during the measured intervals; ordinary internal Ready announcement status entries are expected and are not observer rescue.

All eight cleanup records report settled=true, retainedDirectory=null, error=null. All native message hashes, native packet hashes, and delivered full-envelope hashes recompute. The refusal witness's captured nativeOrigin messages match its actual native arguments; its durable proof rows decode to the specified tail and selected commands.

Derived read-only artifact:
- /tmp/lagrange-runtime-correction-20261015/candidate-controls-independent-event-summary.json
- SHA256 894c632e4596bb6f528ac87ec6bf31552743686149d1df4dfa0748aed23366a0

## Exact staged negative source deltas approved

At inspection, all three isolated detached trees based on candidate 4aa8780cfec6f2718b86b4d1e27ee9711492be59 and had only src/raft/raft-rs-runtime-owner.js staged as source mutation. All three test/helper identities matched the candidate and frozen identities above. Generated metadata refreshes may be separately recorded; another production/test change needs review.

- /mnt/data/peter/projects/.worktrees/runtime-capture-predecessor-20261015:
  runtime SHA256 a560a052bf9b470a2046009555162b60669c340d86274fca9c74126fc8fbd01b. Exact full predecessor runtime restoration, reverting the guard extraction and finite captured extent. Run whole frozen W07; require the named 4 > 1 late-service RED after complete preservation.
- /mnt/data/peter/projects/.worktrees/runtime-capture-before-ensure-20261015:
  runtime SHA256 8c1d03b8846aafd7478b8691d7f771ea9063067b83291bca2538dc7d0ca8dd9f. Only inboundExtent capture moves above thenMaybe(ensureExecution); generation capture and refusal guard stay after/current. Whole companion; require actual completed replay then native selected refusal/order failure from excluding the heartbeat admitted during reconstruction.
- /mnt/data/peter/projects/.worktrees/runtime-capture-blanket-one-20261015:
  runtime SHA256 a0a11fbe8468ff15549457bdfa1a9886cc4eb377fd4ba2b02cbbe75682bcfd70. Only captured extent becomes Math.min(1, group.inbound.length); guard, wake and capture position unchanged. Whole companion; require preservation of both preaccepted occurrences and failure of their required order relative to selected.

The before-ensure file intentionally retains the now-false candidate comment about post-admission capture; this is a deliberately incorrect source treatment, not proposed production documentation. Actual mutation and source hashes, rather than that comment, define the negative.

No expected-negative has been executed by this verifier. Each upcoming run must retain exact committed mutant identity, source/test hashes, first output, named assertion and engaged mechanism. A setup/import/missing-symbol/timeout failure cannot count as proof.

## Input hashes and boundary

01/raw.tap: a89de466a097830e12db5977adef6ed29cee43b4684044ac3fe1bcf5ae75cd0b
01/run.log: f675ce0c2b09a36baa56f4eb91858056c6463928062fcb8bebe3612e720b1783
01/plan.json: 3dd957b94af20eaa76d12be97291434b23c1ecfb64c1dcb86cfdbda1b20dd1d3
02/raw.tap: 96ba7c065ef046e55a13033d0cdd0be4950b62660b2aeb844fa917252ffe677e
02/run.log: 422f81cec76987fb4112039df01fb08b9f6f38b0c4d1870ac431ed4053a32b3b
02/plan.json: 495ef06b082785b800b06fc2536f1282ec4d8e80a73e037d4646e801143b51d4
The derived summary retains hashes of every per-run input, including discovery and exit code.

This review adds observed evidence to the 43-item pre-run census, without extending its scope. Full candidate source approval belongs to the separately assigned reviewer. Final controlled-negative results, affected-owner evidence and final preservation review remain separate. No complete release protocol, snapshot, capacity, distributed-liveness, successor activation/sealing, terminal Quest or merge claim follows.

