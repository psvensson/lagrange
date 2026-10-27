# Independent corrected witness review: C1 predecessor R2b

Reviewer: `subagent:/root/composition_review_r2`. Date: 2026-10-23.

Verdict: **APPROVE the exact corrected test for test-only predecessor
measurement**, conditional on canonical metadata, the actual predecessor commit
and independently reviewed lab packet. No runtime or source-correction pass is
claimed. This verdict supersedes the withdrawn test approval in
`REVIEW-mg-receiver-admission-predecessor-resume-r2-2026-10-23.md`.

## Exact reviewed revision

Repository: `/workspace/scratch/0c0362d1530e/lagrange`.
Branch: `work/mg-delivery-resume-r2-20261023`.
Base HEAD: `1e2fcc2da391ab72883132a22fbfbde39b2313f7`.

| File | SHA256 |
| --- | --- |
| `test/message-group/message-group-cdc-receiver-admission.test.js` | `697d8f40301fc87ad410b22ddb3464244b44b027b70d15c73debd2861fdc6072` |
| Unchanged `test/message-group/message-group-native-custody-fixture.js` | `2806d3980b7b4b0392c79e2924984fb23e26147c5c27a3ed2e5d7a9409ff3012` |

The earlier hash `f4192d3d2510278d258a9c2e085d3c237daa508af2e8e191ef45fef87f8e48e8`
is not approved for measurement. Its follower setup could be satisfied and
retired by the addressed follower's own real native afterCommit before the
held forwarding response was released. The author's additional source trace
identified this; my initial review missed it. The earlier record now preserves
that finding and withdrawal as an append-only addendum.

## Corrected native schedule

The revised forwarding hold calls the fixture's existing native scheduling
function first and returns its genuine custody answer unchanged. For packets
addressed to the selected follower it moves exactly the one newly scheduled
envelope from the existing queue into the test's held collection. Scheduling
to the leader and third voter is unchanged. This retains real RF3 majority
commit while preventing the selected follower from obtaining a local receipt.

The real held terminal response is still validated against the leader's actual
native log, commit/applied indexes, complete event vector and cache body.
Additional engagement checks require nonempty held replication, every held
packet addressed to the selected follower, no matching occurrence in that
follower's native log, and its commit/applied indexes below the actual receipt's
index. In the occupied-follower case its existing semantic waiter must also
remain responsePending=true before the public second input is attempted.

Both forwarding tests release the actual remote result and prove queue size
zero **before** replaying held native envelopes. Native afterCommit therefore
cannot impersonate raw forwarding closure at that observation. They then replay
the genuine held packets and require a fresh public invocation to commit. The
`finally` path releases both holds, pumps the native schedule and restores the
router wrapper before fixture shutdown.

The two leader capacity/deep-capture tests are unchanged. Their actual native
slot, nested Symbol, free-capacity INVALID and valid committed controls remain.
The earlier historical-row correction also remains: when predecessor behavior
wrongly commits the second input, the first receipt is checked against actual
history rather than falsely requiring its older body to remain the current row.

## Complete disposition after correction

| Category | Disposition and evidence |
| --- | --- |
| Scope / authority | Four actual recipient tests only. Source occurrence inputs are declared fixtures; this is not source SQL/ledger/ACK or full topology proof. No native role, readiness, application or receipt outcome is fabricated. |
| Ownership / interaction | Actual public receiveMessage, applyCDCBatch, ProposalQueue and native/router owners remain bound. The correction changes delivery scheduling only; it introduces no new production owner or queue. The earlier bounded consolidation design remains a design recommendation pending measured red and exact source review. |
| Admission / gating | Existing maxCapacity=1 is filled by actual native work or admitted real forwarding. Queue methods/results remain unstubbed. Deep capture is distinguished by nested Symbol with free/valid controls. Occupied follower entry and responsePending are positively checked. |
| Concurrency / currentness | The addressed follower cannot locally apply the held occurrence before the chosen observation. Actual leader/third-voter progress supplies a legitimate remote receipt. Expiry is snapshotted before result release; queue closure is observed before native replay. |
| Transport / delivery | The existing native scheduling answer is retained; exactly its newly scheduled packet is held. Application forwarding still invokes the actual router/handler and holds only after real terminal native completion. Target address, target group, terminal mode and actual receipt history are asserted. |
| Retry / deadline | The same 100-ms received duration and follower creating clock are used. No new grant or retry cadence is introduced. Pending raw work must cause finite UNKNOWN and continued BACKPRESSURE; a fresh call becomes eligible only after physical raw closure. |
| Custody / finalizers | Exact queue entry survives caller response retirement while real raw fulfillment remains held. Separate native hold excludes competing local receipt settlement. Queue release precedes native replay, and late raw completion cannot replace the retired caller answer. Both holds are always released for teardown. |
| Canonical fields | Complete native event fields and receipt index/term still match the real log; canonical full-vector/group validation remains. Invalid input is confined to deep capture, not manufactured success. |
| Harness fidelity | Corrected setup now excludes the previously missed local afterCommit path. Named cuts remain C1_PUBLIC_SINGLE/BATCH_CAPACITY_PRECEDES_DEEP_CAPTURE, C1_PUBLIC_FOLLOWER_CAPACITY_PREVENTS_SECOND_FORWARD and C1_PUBLIC_FORWARD_DEADLINE_SETTLES_BEFORE_RAW_CLOSE. Import/setup/timeout or fixture assertion failures are non-proofs. |
| Recovery / progress | Post-close fresh native completion is a bounded queue-liveness control. W7, W9, retained classification, protected activation, durable transfer, two-start and Quest acceptance remain unproved. |
| Registration / lab evidence | Root owns generated metadata, unchanged-production predecessor tree verification, exact SHA, locked-lab request and full TAP/stderr custody. This source review supplies no measured red result; production edits still wait for the intended predecessor failure. |

## Checks and limits

I reviewed the complete correction against the previously read entire test and
fixture, rechecked both hashes, and independently ran `node --check` and normal
scoped ESLint; both exited zero. No local runtime, source/fixture modification,
metadata/Quest/Git operation or lab submission was performed. Only new review
records and the explicit withdrawal addendum were written.
