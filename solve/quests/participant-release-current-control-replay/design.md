---
audience: development
---

# Current control authority during dependent release replay

## Assignment and status

Proposed witness, not a reproduced failure or accepted repair. Base is
`0115084f7c37d798521e6c4080d143bb95ddc272`, rule-set revision 5. The integration
owner assigned this isolated checkout after source inspection of repeated control
pauses; it owns Git preservation, independent review and managed submission.
Initial paths are this Quest directory and
`test/partition/participant-release-current-control-replay.test.js`. No runtime,
existing proof, fleet candidate, acceptance bound or historical record changes.
AGENTS, rules/router, Solver, authority-and-recovery and test guidelines govern
this unit. Investigation/navigation skills were read; source inspection is not
claimed as a successful Serena invocation.

## Existing contract and recurrence

`seed-control-current-proof-amortization` seal
`68c88fcfdc0bd7e60cff543e295e3ffd15d172a4` explicitly retains both dependent
`releaseControlOwnerFirst` gates and forbids reusing an earlier CUT_OVER. Its
current-control proof requires a fresh PAUSE barrier and actual recipient RESUME;
it is not permission to eliminate control authority. The broad historical Quest
contains unresolved/rejected evidence; this unit does not claim it accepted.
`seed-release-once-per-partition-cohort` seal
`4431a5e94b4128f91576911a76071b0d03bbf962` similarly retains current authority.
The existing `participant-release-protocol.test.js` case
"post-ENABLE control loss returns the canonical control refusal and stays paused"
holds dependent OBSERVE after real ENABLE, removes the actual control service,
and proves final refusal before dependent RESUME. It covers first origin, not
already-current dependent replay.

Source change `3d847d40a1431182cf2a912878079a9eb123ebfa` broadened
`cleanCurrentControlCohort` from SQL_TRANSACTIONS to non-control cohorts. On the
base, `runPausedCutover` can return through `proveCurrentControlCohort` directly
to `resumeCohort`, bypassing `finishEnabledCutover` and its final control gate.
This is a falsifiable source hypothesis, not measured causality.

Task-3823 originals and their limitations remain in
[the integration lifetime note](../../epics/operation-integrity-and-reliable-formation/admission-release-lifetimes.md).
Its 71 untyped participant-release timeout IDs do not identify outer RELEASE,
fresh versus joined runs, or pause generations. Control-pause causality for READY
lease dips and numerical time savings remain unestablished. The first final
unmet snapshot predicate was `control_snapshot_read_failed:seed`; the retained
report was non-admitting and all three trial containers were removed. The new
native schedule cannot retroactively strengthen that physical evidence.

## Transition and owner census

| Fact | Existing authority and consequence |
| --- | --- |
| Entry | `participantReleaseRecovery.releaseOperator` obtains the real authorization and calls `requestParticipantRelease`; registered `ReplicaHandler` executes `runCutoverAttempt`. |
| Control | `releaseControlOwnerFirst` resolves current canonical control owner and consumes its real release answer, release identity, census, origins and enforced transaction schema. No route or old answer is permission. |
| Dependent | `readParticipantReleaseFacts`, committed membership and `releaseCensusDefect` bind partition/build, member configuration, term, replica and lifecycle generation. The PAUSE recipient returns actual closed-admission facts. |
| Commit | `readPartitionWriteOrigin` reads the native durable origin established by the first full release. Replay preserves it; refusal cannot erase it or issue another origin. |
| Final effect | `resumeParticipantCutoverAdmission` validates current service/generation and local facts before opening admission. Its local census alone cannot supply current control authority. |
| Refusal | Lost control after the precheck yields UNAVAILABLE with CURRENT_CONTROL_OWNER, no dependent RESUME and CLOSED admission. No absent control is treated as a successful observation. |
| Time | Existing original process-local handler clock/deadline, 30000 ms fixture caller budget, unchanged leaf cap. The separate 5000 ms observation bound detects missing fixture progress; it grants no runtime authority. |
| Retained work | A refusal leaves the existing dependent origin and closed-admission obligation. Production release recovery remains the continuation owner; this initial witness stops background recovery to isolate one explicit operator attempt, and makes no automatic-recovery claim. |
| Cleanup | Release the held reply in finally, observe attempt settlement, restore transport, then existing fixture shuts down services/recovery and removes its owned temporary database. |

## Exact fixture schedule

Both cases use separate native fixtures and the same schedule:

1. Stop only the fixture's background release-recovery observer. Execute one
   real operator release and require CUT_OVER, durable origins for dependent and
   control, and dependent OPEN. Install the transport observer after this setup.
2. Start a second operator release. Count actual control RELEASE answers and
   dependent actions. Await the first actual dependent PAUSE response *after*
   the real recipient returns; hold only delivery of that response. Race this
   observation against early replay settlement/rejection and a bounded timer.
3. Require one successful initial control release, real dependent CLOSED, and
   unchanged origin at the held seam. Healthy control does nothing. Negative
   control calls the actual control service shutdown and verifies it is stopped.
4. Deliver the unmodified PAUSE response. Observe the replay terminal answer,
   dependent RESUME count, native admission and durable origin. Healthy replay
   must CUT_OVER/OPEN with unchanged origin and no repeated ENABLE/OBSERVE.
   Lost control must refuse CURRENT_CONTROL_OWNER before RESUME and stay CLOSED.
5. Always unblock, observe the same attempt and run original fixture cleanup.

The expected safety result comes from the retained pre/post authority contract,
not a decision table shared with the implementation. The two cases distinguish
blanket refusal from correct authority revalidation. The original post-ENABLE
negative and release lifetime file supply adjacent composition gates. No extra
retry, replacement service, fabricated result, fake SQL or altered deadline is
introduced to make a red.

## Execution and stopping point

The integration owner reviews the test and preserves a source commit, then runs
`test/partition/participant-release-current-control-replay.test.js` through the
existing managed native test owner on an explicitly registered physical host,
using its verified cache, resource/thermal policy and retained raw TAP/process
identity. The execution selection also retains the existing protocol file and
caller-lifetime file as the affected composition gate; no local native test is
run. First red admission requires the intended terminal-authority assertion,
passing healthy control, real setup and clean teardown. Import, setup, timeout
or infrastructure failures are non-proofs and remain preserved separately.

The first request's actual ID and exact source/output manifest will be appended
after submission; none exists yet. The existing execution manifest, raw output
and process/native identity owners are reused. No successful receipt is created
before original execution. After a measuring red, review the causal interaction,
seal the bounded unit, then assign its necessary runtime scope. Full physical
formation/drain and the unchanged 420-second bound stay with item 09.


## Original managed red and bounded correction

The integration owner executed original source
`bd2c33ec50d93a70a65d2c06b8f0a527df4523cd` on registered `adams-gamla` through the
existing explicit-placement classified runner. Original placement identity is
`bd2c33ec50d9-mwpfxueq-3402077`; raw log SHA256 is
`529e1a1ce6ffc5a7303e42b1031279fe2653aa7fd54fb4d72b1dae7263a2e19a`.
The retained selection and ledger bind three files, retry disabled, 25 root
assertions: the healthy replay passed, the intended negative failed at line 157
with actual CUT_OVER, dependent OPEN, and actions RELEASE/INSPECT/PAUSE/RESUME
after the real control shutdown. The protocol's 19 and caller-lifetime's four
cases passed. This establishes the narrow replay divergence, not physical
formation or task-3823 pause attribution. Originals remain under
`/tmp/lagrange-takeover-20261120/control-current-red`; custody/admission and any
seal are recorded separately in the append-only log by the integration owner.

The authorized correction moves the existing final `releaseControlOwnerFirst`
check into `resumeCohort`, the shared pre-RESUME effect boundary, and removes its
old single-path copy from `finishEnabledCutover`. Both clean replay and ordinary
release therefore consume one algorithm. `releaseControlOwnerFirst` immediately
returns null for the control partition itself, so this does not recurse or repeat
its self-proof. It forwards the same original request/deadline and typed refusal.
Recipient generation, lifecycle, membership and full census revalidation remain
at their existing RESUME owner; the nested await cannot authorize a replacement.
This is the existing pre/post control contract, not a new atomic cluster-wide
barrier or permission cached between requests. No acceptance bounds change.

Writable implementation extension is only
`src/node/replica-handler-participant-cutover.js`, plus this existing Quest. The
original witness remains unchanged. Independent source review and a pinned
managed run of the same three files are required before repaired behavior is
claimed. No locally executed native test or new successful receipt is implied.
