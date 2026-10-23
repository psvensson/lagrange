# Independent native fixture candidate R3 review

Reviewer: `subagent:/root/retained_effects_tests`.
Verdict: **REVISE the RF3 recovery schedule for NF1 below.** The bounded
100 ms election-tick configuration, transparent subscriber wrapper, captured
tick-answer diagnostics and S2 route-descriptor update are approved as fixture
corrections. They are not a native runtime result or production acceptance.

Review scope is root's R3 delta and its composition with the new delivery
contract, not self-approval of this reviewer's earlier fixture/source work.
The independently approved trace originals remain the baseline. No test,
production, metadata, runtime, lab, commit or publication was changed/run.

## Exact candidate and baseline

Bundle: `/tmp/mg-native-fixture-candidate-r3-20261023`.

| Material | SHA256 |
| --- | --- |
| Manifest | `a73cbf5a44c9ef243004c5f0343a4e34935f17316580fb7f8b78903775ab2add` |
| NOTES | `7faa11500f2df9888dcccabe629ce71d3bbfc1d8ae18ebe39c8214940c395eaf` |
| Handoff candidate | `e0b0dbcd425c3a87aa15a19886c526d3b5033372521c675056aa4821e5598a6b` |
| S2 candidate | `f977fc15f679f98b8b4de141ee6d8add85e56008bd3223fadb318d1e9efbb6cf` |
| Shared native custody fixture | `2806d3980b7b4b0392c79e2924984fb23e26147c5c27a3ed2e5d7a9409ff3012` |
| Shared provisional-route fixture | `0ad1ba30c274779fddbbf57a199e2a8d4f4ce377f2fc16b62743454d54f71673` |

Both live test files equal the bundle's after copies. The approved-trace copies
also equal the actual Git blobs at
`036dc0019a5c4711c1ec9d9f6c591426fcb1e4b2`: handoff
`7f4cf6984aadb9724b012bd1f32be53e3eda28d065a07a76a7cc5ff2f44cacb7`,
S2 `929c7514e785e8a25713d89a7c6e49bfabd6d8e7ccd0910f50a70700cab4d744`.
The complete delta-from-approved-trace patch was inspected.

I read the independent #1092 record at the trace worktree's
`evidence/LAB-REVIEW-mg-delivery-native-fixture-followup-2026-10-23.md`,
SHA256 `c6ab55c2b97c61117e46aaa63dd7c0803d280d268313ab2b2133454d48d30e18`.
That run remains FAIL: RF1 reaches its early-receipt semantic failure; RF3
records premature source-leader discharge but stops at election; S2 stops in
the old immediate batch before application delivery. This review does not
rewrite those observations or reconstruct the 72,546 elided child TAP bytes.

## Approved bounded setup corrections

The actual timing chain is `resolveReplicaRaftTiming`
(`src/raft/replica-raft-timing.js:17-42`) -> per-index 2500 ms jitter
(`replica-election-timeouts.js:24-47`; `raft/constants.js:45`) -> `tuningOf`
(`raft-rs-runtime-tuning.js:14-35`). The latter uses the explicit tick interval
and `ceil(electionMinMs / tickMs)`, bounded below by heartbeatTick+1.

| Survivor | Jittered election minimum | 20 ms tick | 100 ms tick |
| --- | ---: | ---: | ---: |
| r2, index 1 | 2650 ms | 133 | 27 |
| r3, index 2 | 5150 ms | 258 | 52 |

Under the native default randomization described in the independent source
review, the new ranges are [27,54) and [52,104). Both fit the unchanged 200
rounds. The configured election maximum is not a native random upper bound.
The former default arithmetic is a source-bound sufficiency defect compatible
with #1092, not a measurement of that run's hidden resolved/randomized values.
R3 now observes the actual stored configuration, derived tuning and environment
before its schedule (`handoff.test.js:234-247`). An overriding environment fails
the explicit prerequisite instead of silently changing the test around the host.

Heartbeat/election inputs and per-replica jitter are retained; pre-vote and
check-quorum remain true (`raft-rs-group-constants.js:19-24`). This changes the
fixture's omitted native tick unit, not a production constant or deadline.
LOSS_ROUNDS=200 and the source formation/release BUDGET_MS=10000 remain intact.
It does not guarantee an election: the real leader assertion still must pass.
The schedule still ticks both survivors and accepts whichever native survivor
leads. Returned answers from those required ticks are retained; no extra native
read is introduced merely to format diagnostics (`handoff:250-255,413-434`).

The source subscriber wrapper now delegates the exact private deliveryContext
and the actual zero-argument source getter (`handoff:339-342`). The existing
subscriber defines that getter at
`src/bootstrap/shared/partition-cdc-propagation-subscriber.js:257`; source
progress consumes its identity at `partition-cdc-obligation-progress.js:37-38`.
The wrapper cannot create a grant, source MG or result.

S2 still requires the exact group/address/coordinator target and now includes
the existing selected service/node lifetime fields (`provisional-route:136-145`).
Those fields come from the actual SERVICES/NODES projection in
`src/topology/cdc-group-propagation-routing.js:75-85,136-144`, which the progress
owner now binds. Later whole-descriptor equality remains. This is no new grant
or relaxation of STOPPED B's requirement to preserve the captured target set.

## NF1: old native wait has no scheduled deadline closure before replay

The repaired delivery contract no longer completes the source invocation on
recipient append. The recipient's actual operation awaits its afterCommit
completion, while its queue and genuine source parent retain raw custody.
This is the intended production invariant, not a reason to release the slot
early for the test.

The RF3 test holds the append, replaces that uncommitted suffix through a real
new leader, then immediately calls `driveCdcObligations` and expects a finished
flight plus a fresh native delivery (`handoff:439-480`). But the shared pump
only advances recipient VirtualTimeSources by zero (`custody-fixture:39-58`).
The explicit port ticks advance the native election counter; they do not
advance VirtualTimeSource or fire its positive response deadlines
(`raft-rs-runtime-owner.js:1661-1689`).

At the inspected new owner, `runCdcProposal` waits on `wait.completion` after
append and `armCdcWait` owns a positive timer on the captured recipient clock
(`src/message-group/message-group-cdc-committed-acceptance.js:69-75,154-169`).
Changing native role or replacing the suffix does not by itself retire this
wait. The explicit retire calls are lifecycle open/close/shutdown
(`message-group-consensus-port.js:150,213`; service lifecycle `:152`), none
of which the RF3 loss/rejoin schedule performs. The observed helper digest is
`7bb0595056b206384a9128773b53291ddeef11b66c6b7921b6ce78f9837fb5ae`;
its broader moving R4 implementation is not approved by this fixture review.

Therefore even successful native election and suffix replacement can leave
the old child unresolved on its stationary clock. The source driver correctly
returns JOINED_IN_FLIGHT while its original lane or cleanup is occupied
(`partition-cdc-obligation-delivery.js:645-650`). A source wall-clock expiry
alone cannot close that separately held recipient completion. The test's next
assertions then diagnose missing fresh replay, although the intended cleanup
precondition was never driven. Incidental machine time is not a substitute for
the recipient's frozen clock.

Required finite correction: explicitly schedule and observe the existing
response/deadline/cleanup owner before claiming a fresh redrive, under the same
declared bounds. Preserve the uncommitted cut, source debt, actual native
leader-loss and suffix replacement; prove the old slot is retained before its
actual closure and that no ACK is granted by expiry. Do not resolve the waiter
by hand, clear its map, replace the parent context, add native status reads as
passive diagnostics, increase pump/time limits, or weaken production custody.
The schedule must account for automatic native timers if advancing their shared
VirtualTimeSource. A new exact test delta needs review before another lab run.

## Category and proof disposition

Admission and formation premises remain real source release/SQL/native opening;
the timing correction grants no role/readiness authority. Recovery, concurrency
and retry have the one NF1 prerequisite above. Transport boundaries retain the
whole envelope and genuine context; exact S2 source/target identities remain.
Timer and harness fidelity require a real creating-clock progression rather
than zero-time pumping. Owner interaction preserves the distinction between
public response retirement, native work and actual local cleanup. No new sweep,
retry controller, durable ledger, total fanout/payload cap or activation path is
introduced. The original receipt/debt/native assertions remain indispensable.

The author reports syntax/normal ESLint passing; no runtime is inferred or run
here. The bounded timing and wrapper deltas can be retained, but RF3's complete
loss/replay witness is not independently approved until NF1 is corrected.
Full W7, classification authorization, protected activation, durable transfer,
two-start acceptance, Quest landing and merge remain separate gates.
