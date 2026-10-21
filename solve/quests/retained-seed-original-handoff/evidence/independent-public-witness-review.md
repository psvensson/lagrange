# Independent public baseline witness review

Date: 2026-10-21. Verifier: `subagent:/root/control_source_review`.

Verdict: **APPROVE these frozen witness bytes for one unchanged-source public baseline measurement**, following normal checkpoint and the root owner's locked-host coordination. No tests were executed by this reviewer. This is neither production implementation approval nor a handoff, activation, serving, cleanup-failure recovery, or Quest completion receipt.

## Exact inputs

Worktree HEAD at review: `4a8145c8f01c2f1910c74ad696cdafd5e16f06e3`. `git diff 393f411ca -- src` is empty. Quest statement, constraints and nine declared templates were read. Steering was read in its prescribed order; the authority-and-recovery contract was checked against the actual public entry and native acquisition paths.

| File | SHA256 |
| --- | --- |
| `test/bootstrap/retained-seed-original-handoff.integration.test.js` | `8647322c9fc96716abccff6bc3d272d55d1caa3770fe8dd711e6cc12470b3ab1` |
| `test/test-helpers/retained-seed-public-observer.js` | `7c8adf440a7c77b5cd79d03146705223e7fdc35ac7bdcbc73061c716fbedda1c` |
| `test/test-helpers/retained-seed-public-child.js` | `cfbbc9022f63e7b46ff3521ecfc49894fed4c2c1a800eabe2950b350c4993b45` |

Below, `test`, `observer`, and `child` mean these three paths. References bind to these bytes. The registry diff adds this test to the existing runtime/application contract and coupled witness and to the existing public startup/custody contract; it creates no new runtime authority. Generated metadata and the final checkpoint remain the writer's responsibility.

## Mechanism and result classification

The child calls the actual `startLagrangeRuntime` with a supplied directory, stable node identity and allocated listener ports (`child:12-26`). It supplies no seed decision, bootstrap configuration override, grant, process-claim reset, native replacement or shutdown fault. Actual public startup owns membership/storage admission, bootstrap construction and unwind (`src/lagrange-runtime-startup.js:390-473,701-785`). Native founding still goes through `seed-partitions-phase.js:215-305`; registration copies the actual partition objects into the actual handler registry (`bootstrap-service-replica-registration-methods.js:291-292`).

The observer selects an outstanding real FRESH_SEED RELEASE matching partition, absolute deadline and build, then selects its non-control ENABLE (`observer:122-138`). Each intercepted delivery calls the original once; the response/error is returned or rethrown, with an additional promise reaction needed to insert the fault after actual delivery settlement (`observer:153-181`). This is not promise-identity or zero-observer-overhead evidence. Native origin and admission are read only as observations; no observed value grants permission.

The test requires a real OBSERVED answer, absent-before/present-after positive origin, completion before the real issued deadline, closed admission, exact outer OBSERVE_APPLIED_POSITION deadline refusal, no selected-attempt OBSERVE/RESUME dispatch, and a completed control release (`test:82-111`). The handler clock is then fixed at that actual absolute deadline. This affects the handler's subsequent clock reads, not just one invocation. Original native/service and node clocks are retained, and real timer methods are delegated unchanged (`observer:106-119,141-150`). This is a controlled boundary ordering, not evidence of a natural thirty-second wall-clock expiry or startup performance.

Only after actual first-process settlement and exit does the parent open the native file read-only and start a second public process (`test:139-153`). The second process cannot inherit process claims, JS registries or handler caches. The final desired error-code assertion (`test:158-159`) is intentionally future behavior. On unchanged source, a failure there counts as the intended public-frontier baseline only if every preceding engagement and cleanup assertion passed. An earlier routing, admission, construction, clock, process, native, serialization or cleanup failure is a prerequisite finding; it does not authorize substituting the lower BootstrapService entry or beginning a repair from an unengaged red.

## Nine-category correspondence

### Admission/gating — items 1–7

1. There is no harness admission precheck. Public membership/storage readers and existing native construction enforce admission; the test observes their actual outputs (`child:13-26`, `test:88-89,154-157`). 2. Existing typed refusal shapes are retained in reports, not classified into a fake success; desired deferred code remains an unimplemented final expectation (`observer:23-28,63-81`, `test:158`). 3. The original public default is checked both against its owner and the current 30000 value; no bootstrap budget is supplied (`test:86-87`, `bootstrap-constants.js:395`). The 90000 test bound includes both processes and teardown, not a new product budget. 4. Real answer fields and error fields are inspected without translating them into admission. 5. Restart is a new public call after cleanup, not a fabricated hold-release event; a future grant wake is unproved. 6. Admission snapshot is captured at real ENABLE settlement and origin is independently reread after process exit (`observer:141-150`, `test:142,152`). 7. Reports retain partition, replica, full attempt, deadline, origin and actual creation-refusal definition; first divergence must be reported using those identities.

### Recovery/replay — items 1–5

1–2. No recovered state is written by the harness. Two forked processes and distinct PIDs eliminate live-registry reuse (`test:31-45,139-144`). 3. Nonempty first-process native inventory, actual registered ENABLE and positive origin exclude an empty-cohort positive (`test:77,91-95`). This does not prove complete declared-cohort issuance. 4. The selected origin must survive both process boundaries; no replay-dedup or complete handoff success is claimed (`test:142,152`). 5. An empty second-process inventory is legal if public startup refuses before construction; the actual error is preserved and cannot satisfy the desired code accidentally. No absence is promoted to a grant.

### Retry/re-drive — items 1–7

1. Existing retry owners remain intact; no retry is suppressed to manufacture a refusal. 2–3. Existing absolute deadline governs release, and the first actual public stop/error is recorded. 4. This run does not resolve any hypothesized formation cycle. 5. One initial and one restart call are made; no retry-on-failure search loop exists in the parent. 6. All late or background traffic remains subject to existing owners; negative dispatch assertions are restricted to the selected full attempt (`observer:185-200`). 7. No ACK or observation resets an attempt/deadline. Evidence does not certify every retry branch or storm ceiling.

### Transport — items 1–5

1. Engagement uses the participant result and committed native origin, not ACK alone (`test:93-95`). 2. The observer awaits the original settled delivery before expiring the handler clock and does not cancel late deliveries (`observer:160-171`). 3. Existing classifiers remain in the original client path; no hand-authored delivered envelope is substituted. 4. Existing delivery timeouts and the outer test bound remain; any hang before engagement is a prerequisite failure. 5. There is no router stub. Nonparticipant deliveries return directly through the original method; participant calls preserve arguments and receiver (`observer:175-181`).

### Timer/sweep — items 1–5

1. The only timing treatment is the existing handler TimeSource seam; its real timers are delegated. No new periodic timer is installed. 2. Real leadership, current control owner and native commit remain prerequisites; the clock cannot manufacture them. 3. A new child discards all JS state. 4. The test proves an explicit deadline ordering, not elapsed-time equivalence or a serving-window margin. 5. The observer performs no read-through serving query to enable recovery; readonly origin observation is not a wake or actuation. Existing timer/read circularity is unaltered and not certified.

### Concurrency/serialization — items 1–5

1. Public process claims and directory custody remain the real gates (`lagrange-runtime-startup.js:714-719,771-785`). 2. First settlement and exit precede readonly inspection and second spawn. The report snapshots DB closure before process exit; killing a process is not counted as shutdown. 3. No competing claim/creation writer is added. 4. Native and recovery timers remain active during the fault; unrelated traffic is retained rather than suppressed. 5. Directory reacquisition is through the real owner for the exact retained directory (`test:124-126`). This is evidence of reacquisition after the process boundary, not independently of process termination.

### Formation/circularity — items 1–5

1. Actual startup performs its existing membership, storage, topology/control and creation interactions. The baseline records the earliest unavailable prerequisite rather than authoring replacement facts (`test:154-157`). 2. No new redrive or cached-read fallback is installed. 3. Real listeners are acquired; public-client admission fencing is not exercised by this witness and remains a separate obligation. 4. Real issued 30000 deadline is retained, but no performance margin follows from the injected clock. 5. No SERVICES row, cluster identity, lifecycle grant or native history is synthesized. The pre-source STOPPED-versus-activation and mutation-cut issues remain unresolved.

### Harness fidelity — all six items

1. **Right red:** `test:82-111,139-159` requires selected native engagement before the final code discriminator. Preserve full raw output and classify any earlier failure separately. No measurement has occurred yet.
2. **Seam honesty:** original public startup, constructors, listener ports, routing and shutdown remain real; only passive wrappers and the specified post-ENABLE handler-clock fault are installed (`child:12-38`, `observer:63-181`).
3. **Time fidelity:** no product budget is compressed. The shared handler clock jumps to D after real origin commit; timers/native/node clocks remain real. Additional observer promise reactions and reads make this unsuitable for timing comparisons.
4. **Field fidelity:** all release/attempt/origin fields come from actual delivered objects and native owners, not fabricated fixture rows (`observer:122-150,185-200`).
5. **Nonvacuity:** nonempty inventory, selected actual ENABLE, positive origin, control CUT_OVER, full-attempt dispatch checks and distinct cold PID are mandatory. Complete grant/cohort, public admission and activation proofs are expressly absent.
6. **Live binding:** the pending locked baseline must bind these exact hashes and unchanged production393, retaining first refusal and raw child output. This review alone supplies no runtime receipt.

### Owner interaction — all ten items

1. **Question owner:** existing startup/creation/release owners decide permission; the observer only explains the actual operation. 2. **Typed boundary:** real release answer and real public startup error are retained; expected deferred code is future intent. 3. **Paired invariant:** actual origin persistence and actual release refusal/cleanup occur in one sequence; future handoff plus nonserving admission still needs its own paired proof. 4. **Temporal replay:** second cold public ingress reads retained facts through the canonical path; it may legitimately refuse. 5. **Pressure:** no force flag, bypass, compressed budget or repeated baseline loop is introduced. 6. **Wake:** the only harness action after first settlement is the next genuine public startup; no status request or direct owner recovery actuation is injected. 7. **Projection:** reports, `db.open`, admission snapshots and origin reads never authorize effects. 8. **Treatment:** one actual post-ENABLE clock fault binds the known window; this is not a source mutation or semantic-negative certificate for a future repair. 9. **No escape:** child uses public entry exclusively; no forced seed, direct factory, process-claim reset, manual close fault or successful-result substitution occurs. Parent readonly SQL is performed only after process exit. 10. **Alignment:** registry additions remain on existing contracts/pair; Quest has eight still-unproved receipts and retains activation/handoff obligations. Final source correspondence and candidate metadata must be reviewed independently before production measurement.

## Custody and explicit ceilings

`child:29-38` retains unexpected-runtime shutdown errors and actual startup errors; public unwind already aggregates primary plus cleanup failure (`entrypoint-startup-acquisition-ledger.js:57-73`). `test:72-79,145-150` rejects that aggregate and any observed open native DB as a prerequisite failure. Creation and bootstrap observers return the original promise; delivery observers return a derived promise while preserving the original value/error for the ordinary owner error shapes used here. Error serialization is diagnostic, not an arbitrary hostile-JavaScript or cyclic-error contract.

All observed host-map DB identities are retained before cleanup (`observer:49-60,106-108`) and checked while the child is alive. This inventory does not prove that an arbitrary failed constructor published every native allocation to those maps, nor complete allocation issuance. The first actual ENABLE path is source-bound to the registered bootstrap objects; constructor failures before this engagement are prerequisite failures. A future positive handoff witness will need its complete-cohort and admission/activation oracles, not just this inventory.

The parent retains the directory on every failure and emits raw child output; child termination is teardown only (`test:31-57,129-138`). The FAILED-event listener lives at most for this one child process; restoring method descriptors does not remove that listener. There is no claim of reusable in-process instrumentation. Successful future deletion requires all current witness assertions, but must not be treated as certification of all future grant resources without the later scoped witness extension.

No blocking code finding was identified for this limited unchanged-source baseline. The unresolved pre-source mutation cut, exact activation obligation, ingress sink fences, consume-before-send route and issuance/abort protocol remain HOLD as recorded in the separate pre-source review. This approval does not resolve them.
