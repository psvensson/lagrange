# Native capture-boundary companions — pre-run plan

Base source: `a7e821154f1039df82bfc73ef4f2e25e4fa0468d`.
This is a test-only companion to W07. No execution is claimed by this plan.
The independent verifier must approve the exact test/helper bytes before their
first native execution. Root coordinates locks, runs, comparisons and evidence.

The frozen `runtime-captured-inbound-service-native.test.js` remains unchanged:
Git blob `debc16f442ba63b100332d93b285865d36d1c376`, SHA256
`07f9cd3a396b1036f96e2130efa454f1702b7acc6ad7e45b14274c5c3a3bce8d`.
New files are `test/raft/raft-rs-backend/runtime-captured-inbound-boundary-native.test.js`
and its test-owned `runtime-captured-inbound-companion-fixture.js`.

## One production owner and existing seams

`raft-rs-runtime-owner.js` owns `enqueue`, `perform`, `ensureExecution`,
`drainInbound`, the authoritative inbound array and `runScheduledInboundDrain`.
The production operation port supplies lifecycle admission. `PartitionNodeCluster`
supplies actual raft-rs WASM operation ports and per-replica SQLite databases;
`sendFor` delays genuine native Ready output and later forwards the exact packet.
No production hooks, fields, commands, deadlines or timers are added.

The existing `setActualCoreEntryObserver` records native sequence/generation.
The existing `setCoreFaultInjector` normally only records actual step/propose
arguments because the entry observer omits them. These observers are passive.
Two separately labeled cases intentionally use its active fault capability:
a final-announcement WASM trap, and a real SQLite BEGIN at reconstruction's
native `persist_ready`. Neither injects a successful authoritative result.
`setNativeInboundStageObserver` observes actual admission and wake transfer.

## Exact schedules and endpoints

| Case | Cut and allowed progress | Required native observations |
| --- | --- | --- |
| Queued capture | Hold B's real forwarded predecessor send. Queue selected B proposal. Only then accept two copies of a captured, unchanged A-to-B heartbeat. Fire B's existing zero-time inbound wake once so its DRAIN queues behind selected. Release predecessor; no further clock or port call. | Both exact native steps and actual replies precede the selected native proposal. Typed selected success and both preserved copies are checked before the ordering assertion. A wrong enqueue-time or one-envelope capture still has a queued remainder driver and can reach the direct behavioral assertion. |
| Consumed wake remainder | As above, but capture only h1 before selected starts. Hold h1's real native Ready reply. Admit h2 while Ready is waiting. Fire B's existing wake once; observe callback and queued-turn request while only h1 has stepped. Release h1. | h1 precedes selected; h2 follows selected and produces its real reply without a new message, clock advance, readStatus, tick, settle or deliverAll. This proves the consumed wake already owns a FIFO continuation; it does not claim a new timer/rearm is needed. |
| Pre-dequeue generation guard | Accept real h1/h2 before selected. After h1's native reply, inject one WASM trap into final `announce` status immediately following `has_ready`. | Initial operation returns HOST_FAILURE/generation-changed, h1 has one exact step/reply, selected never enters, and both deliveries were accepted. In a separately marked recovery phase, one explicit existing B tick invokes canonical replacement/reconstruction; h2 must step/reply once in the new generation. This is retention/recovery evidence, **not** autonomous progress. |
| Admitted reconstruction capture | Commit a real marker with A+C. Deliver actual B envelopes one at a time until a one-shot `applyFor` failure rolls back marker application. Stop B with native durable commit above applied. Selected B proposal reconstructs via `ensureExecution`; its real `create_node` identifies B by `args[0].id`. At reconstruction's `persist_ready`, open a real SQLite transaction. Admit saved heartbeat while that existing persistence poll holds reconstruction. Roll back the host transaction and dispatch only B's existing poll interval. | Marker has no exposed effect before admission, then replays exactly once. Actual heartbeat step/reply precedes selected native proposal, which really forwards. No measured status/tick/transport flush is used. This distinguishes capture before `ensureExecution` from capture after its successful completion. A missing reconstruction Ready is a seam failure, not a semantic RED. |

The first case also supplies a two-envelope extent control. The immutable W07
native peer-refusal/valid-tail control remains the separate proof that a handled
refusal does not terminate the captured prefix. W07's finite pressure case
remains the original semantic RED; a companion control may pass the predecessor.

## Bounds, cleanup and classification

All input envelopes originate from the actual RF3 leader and keep their complete
shape. Deliberate duplicate delivery is labeled; SHA256 of the whole envelope
and native message is retained. The service endpoint is native `propose` entry,
not admission ACK, eventual application or release-protocol success. Native
heartbeat reply counts guard against empty or unengaged cases.

Virtual clocks retain production intervals. Only existing owned timers are
dispatched; no interval, timeout or service limit is changed. Formation uses the
existing `PartitionNodeCluster.settle` driver and its unchanged default bound of
200 rounds, first for election and then for one applied entry plus empty fixture
inboxes. Manual heartbeat capture and partial-quorum setup each use at most 12
rounds. Passive Promise observation uses a 256-microtask guard and cannot
enter Raft. A guard/import/setup failure is never a claimed behavioral RED.

Every observed invocation and held send gets both fulfillment and rejection
observation. Finally freezes measured diagnostics, releases held real sends,
rolls back any test-owned SQL transaction, and dispatches its existing poll only
for cleanup. It waits for observed continuations before closing databases. If
cleanup cannot settle, evidence retains the database directory and preserves the
primary failure. Cleanup events cannot satisfy measured assertions.

The reconstruction case records the full selected result, durable progress and
marker count before asserting success. Marker replay/progress are checked first,
so an incorrect pre-ensure capture that proposes before leader contact retains
its exact native refusal separately from the already completed reconstruction.

Before first native execution, independent review requested that diagnostic
addition. Static duplication review also found copied formation/quiescence logic;
the companion now uses the existing fixture's settlement/delivery loop for both
application and quiescence instead. The frozen original remains unchanged.

## Verification categories and scope limits

Harness fidelity: real native/SQLite seams, complete captured fields, unchanged
time constants, engaged fault/Ready guards, native steps/replies and exact bytes
exclude vacuity. The plan makes no native PASS claim before execution. Root must
preserve the first whole-file outputs, same-byte predecessor results and separate
incorrect-capture treatment. Wrong-treatment setup failures are not proof.

Concurrency: group FIFO is the existing synchronous gate; the queued-cut and
consumed-wake cases check admission after waiting and prevent timer reentrancy.
The fourth case checks the actual asynchronous execution-admission boundary.
The guard case checks the generation fence before destructive queue removal.
Per-partition/per-replica identity comes from the native fixture, not a new mutex.

Recovery: actual durable commit/applied separation and transactional rollback
precede replay. The trap case explicitly distinguishes an old failed turn from
new-generation service. Neither missing rows nor missing observer events are
treated as proof of noncommit. This fixture proves neither snapshot install nor
transaction/release authority.

The bounded System Guidelines audit concerns the runtime owner, operation port,
timer custody, persistence admission and existing native fixture. The known
capture/guard defects are the root-owned source task, not repaired inside tests.
No competing queue, retry policy, serving authority or harness is introduced.
The helper repeats only frozen witness setup/observation utilities because the
historical file cannot be edited or imported without executing its tests.

This is a W07 prerequisite. It proves no total queue/memory ceiling, physical
multi-host certification, release commands, production retention bound, successor
activation, Quest completion or merge readiness. Other owner obligations and
inherited failures remain root's separate integration gate.
