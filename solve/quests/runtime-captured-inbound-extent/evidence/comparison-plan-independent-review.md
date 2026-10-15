# Independent source-comparison plan review

APPROVE the three bounded source-only comparison designs in COMPARISON-PLAN.md for their stated isolated, locked runs, subject to later inspection of the actual source deltas and first raw outputs. No mutation or execution was performed by this verifier. This is plan approval, not production-source approval or a result.

Reviewed plan:
solve/quests/runtime-captured-inbound-extent/evidence/COMPARISON-PLAN.md
SHA256 e3dceba4fbc7cf1fcdc8d73f3e575f63e3eb00d9394eb44d9d28f7a2a8c72c07.

At read time HEAD was 04391697aeabea5ddd504491321546212b95982e, and the parent-owned candidate runtime source was SHA256 b47951f39c6a5e7b93670a3a730115b3993976e808ec2e7d76598ade270dbc0f. This review inspected that diff only to identify the intended mutation sites; the other independent reviewer owns full candidate source approval.

## Treatment fidelity

1. Full predecessor runtime / frozen W07.
Replace only the production runtime-owner file with exact a7e821154f1039df82bfc73ef4f2e25e4fa0468d content (SHA256 a560a052bf9b470a2046009555162b60669c340d86274fca9c74126fc8fbd01b), keeping current tests/helper/dependencies fixed. The named 4 > 1 late-service failure must occur after input and reply preservation. This reverts both the captured-extent and pre-dequeue-guard production changes; it proves binding to the total proposed runtime delta, not separate causal attribution to one changed line. The two narrower treatments supply that discrimination.

2. Capture before ensureExecution.
Move only inboundExtent capture to immediately above thenMaybe(ensureExecution(...)) in perform. Keep persistence precheck and generation capture in their proper existing positions; preserve the new execution guard, finite-drain logic and all test bytes. This captures the empty queue before the real reconstruction persistence wait. The companion reconstruction schedule then accepts a heartbeat during that wait. With the incorrect extent, selected native propose can precede the heartbeat and be refused because restored B has not yet regained leader contact. That is a legitimate behavioral negative if the full retained result, native event order and completed durable replay prove it. It need not fail at the later explicit ordering assertion. The reviewed test now records exact result, applied/committed positions and markerCount before checking success, so an unrelated native or setup failure can be distinguished. No missing method/import/seam guard/timeout is evidence.

3. Blanket-one extent.
Replace only the post-admission inboundExtent expression with Math.min(1, group.inbound.length). Preserve the execution guard, generation placement, queue and wake. In queued-capture, two messages were accepted before selected admission; the existing queued DRAIN remains behind selected. Both copies/replies must survive, while selected occurs between them, making the ordering oracle RED. An input-count failure before intended ordering, a lost wake, setup failure or timeout must be reported separately and cannot be represented as the specified proof. This treatment does not justify a permanent one-envelope cap: the selected contract includes the complete preaccepted finite extent.

The statement that no bound changes is read as no test oracle bound, timeout, clock or admission budget changes. The blanket-one treatment explicitly changes the algorithm's captured extent and must be described that way in its diff/results.

## Required evidence binding

For all three:
- Run on the same locked lenovo-laptop and unchanged dependency graph as the candidate comparison; each treatment has its own isolated exact checkpoint and first whole-file output.
- Preserve actual runtime diff/hash, base/candidate/mutant commit, test/helper hashes, command/plan, placement head, retry setting, exit code and raw TAP.
- Keep generated metadata changes separately identified from the single deliberately changed production file. No test criterion, source symbol, schema, timeout or clock edit is permitted.
- Expected-negative files stay out of the positive certification population. A nonzero exit alone proves nothing.
- The before-ensure and blanket-one treatments must retain candidate guard/queue semantics so the intended capture defect, rather than a second changed mechanism, explains the result.
- No broad performance, distributed liveness or total queue-capacity claim follows from these finite native schedules.

Exact unchanged test identities read:
- Frozen W07 SHA256 07f9cd3a396b1036f96e2130efa454f1702b7acc6ad7e45b14274c5c3a3bce8d; blob debc16f442ba63b100332d93b285865d36d1c376.
- Companion test SHA256 9cb552e83ef5fcdcc1ab0248961b7e2b9f14961542b3c1178fad3a95b8d2c1ff.
- Companion helper SHA256 4ac1dce5cc8bb72de533055b03ea892fb212fbd24d16b586edac21243fdc014e.

This plan satisfies the relevant harness-fidelity 1/3/4/5/6 and owner-interaction 3/8/10 treatment requirements on paper; source deltas and raw results remain unverified until produced. The previous 43-item witness reviews and first-baseline classification remain unchanged. No approval to publish/merge, complete the Quest or activate/seal the release successor is given.

