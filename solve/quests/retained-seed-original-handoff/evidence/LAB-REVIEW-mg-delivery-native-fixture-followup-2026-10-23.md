# Independent lab review: native fixture follow-up, 2026-10-23

Reviewer: `subagent:/root/retained_effects_review`. Review started at 11:23 UTC.
This record concerns the commissioned two-file baseline at
`036dc0019a5c4711c1ec9d9f6c591426fcb1e4b2`, not the separate, moving MG
production draft. No source/test edits, local test execution, source workload,
or replacement lab submission were performed by this reviewer.

## Verdict and measured boundaries

**Reconciled COMPLETE / FAIL. Two selected files completed, zero passed, two
failed; the runner reports three assertions (the three top-level native test
cases, not a count of every Node assertion executed inside them).** The
generic driver's last-file counters report two tests; they are not the complete
two-file census. The final runner line is
`test-files total=2 pass=0 fail=2 assertions=3`.

| Witness | Reached and observed | First failing assertion / limit |
| --- | --- | --- |
| RF1 native receipt | Real producer CUT_OVER, ordinary SQL, applied outcome and exact owed CDC; actual subscriber, seed bridge and running topology returned success; recipient cache contains the row while durable commit/applied remain 1 with only the no-op. | `RF1_ACCEPTANCE_REQUIRES_NATIVE_AFTER_COMMIT` at handoff test line 170, called at 341: no canonical native receipt or native CDC entry. This is an engaged semantic failure. Later RF1 source-ACK assertions did not run. |
| RF3 native custody | Same real producer setup; the actual recipient leader retains CDC index 2/term 1 with commit/applied 1, followers have no CDC entry or row. The source leader has committed/applied CDC_DELIVERED at index 6 and owes zero while the recipient occurrence remains uncommitted. | `actual remaining recipient quorum elects a leader` at handoff test line 401. Both survivors are still healthy, open-gate term-1 followers after 200 rounds. Rejoin, suffix replacement, post-loss redrive and final custody assertions did not run. Early ACK is observed; the full loss/recovery witness is unengaged. |
| S2 provisional route | Real SERVICES CUT_OVER; real RF5 formation and retained F1/F2 reopen/partial routes; ordinary A/B SQL at native indices 5/6 with exact debt; actual source selection entered and running topology queued A. | `S2_PROVISIONAL_A: actual registered handler returned; []` at provisional-route test line 246, called at 304. A is still in an armed immediate batch and no application send occurred. F1/F2 ingress, provisional result, B scan progress and eventual native route are unengaged. |

The raw worker places S2 failure and setup diagnostics at lines 36–76, RF1 at
77–105, RF3 at 106–140, and final file census at 142. All three failures are
assertions, not a thermal abort or source timeout. No part of this run approves
the new MG implementation, complete classification, protected activation,
durable transfer, composed two-start startup, full Quest closure or merge.

## Exact execution and source custody

The source job is [lab #1092](https://github.com/psvensson/lagrange-lab/issues/1092).
Its [terminal receipt](https://github.com/psvensson/lagrange-lab/issues/1092#issuecomment-6363301898)
records exit 1, outcome FAIL, exact source, and closed scopes.

| Binding | Value |
| --- | --- |
| Source | `036dc0019a5c4711c1ec9d9f6c591426fcb1e4b2` |
| Preservation ref | `refs/heads/work/mg-delivery-fixture-trace-20261023` |
| Controller | `b4a2e06c193c44b09f1b67d02e8d80f4` |
| Job / normalized request | `890bbfaa50ff4ff7867c8defc512040d` |
| Logical request | `890bbfaa-50ff-4ff7-867c-8defc512040d` |
| Envelope SHA256 | `6cd4bbf4c0bfce4bec495380c09ae85f50abe5a0ac864614fbc3bb32faaf401a` |
| Payload SHA256 | `220373924b4a7d7b3745dfbf7015cefb9656503b7b8be55c996394fe1edbd955` |
| Physical worker | `tv-dator` |
| Runtime | Node `v22.23.2`, npm `10.9.8`, fresh `npm ci` |
| Selected files | `message-group-native-custody-handoff.test.js` and `message-group-native-provisional-route.test.js` |
| Native handoff test SHA256 | `7f4cf6984aadb9724b012bd1f32be53e3eda28d065a07a76a7cc5ff2f44cacb7` |
| S2 test SHA256 | `929c7514e785e8a25713d89a7c6e49bfabd6d8e7ccd0910f50a70700cab4d744` |

CLAIMED is recorded at 10:54:12.196 UTC, RUNNING at 10:55:44.469,
and COMPLETE at 10:56:33.526 (worker finished at 10:56:33.432).
The exact packet was decoded: its one part reconstructs the intent and matches
the stated payload hash. It selects exactly these two tests under
`npm run test:file`, not a broader acceptance suite.

The 77-path preservation manifest
`MANIFEST-mg-delivery-native-fixture-followup-r2-2026-10-23.json`,
SHA256 `cca588b15750651e206967f1312164abec834057e5fe419f675cfcd568953b2e`,
matches both all local files and all 77 committed blobs at the executed source.
The trace worktree initially has clean status and exact HEAD; its entire
`src` diff from `21cfd917d8ceb2f0c1435cade117c0c44a91a03a` is empty.
Earlier preservation/static approval remains source-only; it does not turn
these failed runtime results green.

## Complete worker stream, child-output limitation, and cleanup

The original worker log is 230,186 bytes, SHA256
`5a594842a01fe52637e50046cdaf56ea60d347af15017402af417d4ce94010d8`,
stream `797bf81ea51c39ff42545789c24c7855aca2c7a513f5bc34d5fcdddfd7627d33`.
All 29 original read-only evidence chunks were independently verified:
contiguous offsets 0 through 224000 in 8000-byte steps, the final 6186 bytes,
every chunk/raw digest, base64 decoding, original byte/hash declarations,
request/envelope identity, controller, exact job, host and stream. Reassembly
equals the saved worker log byte-for-byte and matches the terminal worker hash.
Every successful evidence result is read-only with `executed_source:false`.

The successful evidence issues are #1094, #1096, #1097, #1124, #1099–#1108,
#1125, and #1110–#1123, in offset order. Original read-only failures #1098
(offset 24000) and #1109 (offset 112000), SSH exit 255, remain preserved.
#1124/#1125 retrieved those exact offsets of the same original stream; neither
ran the source workload again. The 8,204-byte controller terminal tail,
SHA256 `9d72675ced4fdfa3d56095c199e0aa87f03f602fe49c40aaffd2d9ce3c213bd2`,
is not substituted for the full worker log.

**The complete worker stream does not contain the complete child S2 TAP.**
At worker line 65 the repository runner explicitly reports 72,546 bytes
elided from
`.tap/test-results/test/message-group/message-group-native-provisional-route.test.js.tap`.
The missing-return JSON starts at line 64 and continues after that omission
at line 66. Escaping cannot reconstruct missing bytes. Intact diagnostics
were decoded using the existing TAP backslash unescape method; the S2 event
census prefix and complete scalar/queue-state suffix were inspected as
fragments, never represented as a complete decoded JSON object. Original TAP
artifact collection is pending in this initial section; any independently
verified completion is appended below.

This distinction is systematic and source-owned: `scripts/run-test-files.js`
keeps 64 KiB at each edge for failed-file console output, while preserving the
full child TAP. Commit `71424a5f4bd2718978c71173acb9bd45c59afc9f`
introduced bounded streaming after a 608 MB output caused V8 string-cap
failure. Therefore `log_truncated:false` at the controller proves the
worker stream is complete, not that every child diagnostic was echoed.

The source receipt reports `scope_closed` and `execution_scope_closed`;
the physical worker reports containers, execution and thermal scopes closed.
Last thermals are CPU 56 C, SSD 33.85 C and auxiliary SSD 51.85 C, no missing
sensor. No thermal-abort conclusion or performance comparison is inferred.

[Pre-fleet #1091](https://github.com/psvensson/lagrange-lab/issues/1091#issuecomment-6363233906)
found tv-dator free, CPU 54 C, boot
`9c9e76b2-708e-4aa0-b920-34d36843d261`. Four of six locks were free;
lenovo-laptop and local-workstation were busy.
[Post-fleet #1095](https://github.com/psvensson/lagrange-lab/issues/1095#issuecomment-6363399983)
found all six locks free, tv-dator on the same boot, CPU 60 C.
Both embedded fleet JSON digests were verified:
pre `32465d24cc32f62535578b2a05d82a8447262158472ae064a492f35a2bc93bfb`;
post `0cabec5ea0a82055db176e271961d551356f64d7328cc4cf41f9bbef826b9f12`.
Closure applies to this completed job and these observations, not future fleet
availability.

Local original/derived custody artifacts use the prefix
`/tmp/mg-delivery-native-fixture-followup-runtime-`: `request.json`,
`terminal-receipts.json`, `worker.log`, `log-custody.json`,
`evidence{offset}.json`, failed-query records, `post-fleet.json`,
`independent-custody-verification.json`, `diagnostics.json`, and
`s2-diagnostic-tail.json`. Root owns archival copies of original evidence;
the derived files are analysis, not replacement receipts.

## Source-bound S2 scheduling diagnosis

The retained snapshot prefix counts one `actual-subscriber-input`, one
`actual-source-selection`, one `actual-topology-started`, and no
`application-send` or `application-return`. Its intact suffix records:

- Source tenure is current, `inFlight:true`, `rerun:false`, cursor null,
  through native log index 6 / ordinal 0, `provisional:false`.
- No pending ACK or ACK command, no retry or flush timer; the old last-drive
  observation remains `no_subscribers/committed_entry`.
- Topology state is running; one immediate timer and one batch entry, zero
  background retry entries/timers and zero retry sleeps.
- The batch belongs to source `mg-provisional-source`, targets the actual
  `mg-provisional-target-f1` address, has one resolver, `timerPresent:true`,
  and retains A's SERVICES INSERT row key.
- Native queue is empty, two native envelopes are held from setup; no held
  application or application settlement exists.

Thus the observed first failure is **before the batch dispatched to F1**.
An empty application-error list is no longer the sole discriminator.
It does not demonstrate failure of F1 hydration, F1-to-F2 forwarding, F2's
canonical provisional result, or later leader routing.

The exact owner chain explains this cut. The fixture starts the actual tree
and topology, supplies no batching override, and after the subscription
handshake calls `tick(f)` once
(`message-group-native-provisional-route.test.js:144,297–304`).
Its fixture ticks each actual MG once and pumps 64 rounds of queued native
delivery, zero virtual-time advance, microtasks and real `setImmediate`
turns (`message-group-native-provisional-route-fixture.js:103–131`).
That is not a minimum elapsed duration for a host timer.

The existing topology routes this single internal-cache table event with
nonempty targets into `enqueueImmediateBatch`
(`cdc-group-propagation-delivery-methods.js:77,183–234`).
The default window is 10 ms
(`cdc-group-propagation-service.js:41,106–108`), armed through real
`setTimeout` (`cdc-group-propagation-lifecycle-methods.js:65–66`).
The drain clears the timer/map entry before application delivery begins
(`cdc-group-propagation-delivery-methods.js:287–324`).
An entry and timer still present at the cut identify that pending owner
boundary. They do not prove the timer would never fire or which later defect
would then occur.

The baseline also loses source metadata while building this batch:
`enqueueImmediateBatch` retains only its row-based key, table, operation and
data. This is a separate, already-approved production correspondence problem,
not a cause inferred for the missing F2 return. The native occurrence key
`entry:provisional-route-a` and the pending row key
`services|INSERT|mg-provisional-source-r1` are not interchangeable proof.

The former #1049 source review correctly left batching as an unmeasured
alternative; #1092 now observes it. The queue's origin goes back to
`46b65f8abbd145900ff92e1d30a9db502a9b8a51`.
Existing topology batching tests await the actual propagation settlement, and
stop-settlement tests explicitly observe an outstanding immediate batch.
A future fixture correction must name the actual timer/dispatch or handler
completion boundary under a declared budget. It must not lower the production
batch delay, flush its private queue, expand arbitrary pump counts, fabricate
a result, or claim the original 64 turns had a wall-time guarantee.
No such correction is approved or implemented by this review.

Existing S2 `targetView` calls native `readStatus`, and `sourceView`
reaches the lane diagnostic owner. Those already-authored witness observations
are not generally passive. The new missing-return snapshot reads captured
events and scalar/raw map state only, without adding these owner entries.

## Source-bound RF3 clock and election diagnosis

The intact terminal vector reports `elected:false`, 200 of 200 loss rounds,
and both r2/r3 as term-1 followers, commit/applied/last 1, exact three-voter
configuration, no learners, open participation gates, recorded identities,
healthy usable native runtime generation 1. Their peer addresses resolve;
there are no recorded inbound-step refusals. The carrier has no queued
packets and only the two original held CDC append envelopes. Its event census
shows no post-loss native sends. This is not proof of a voting, local-log-guard,
or transport rejection; no such rejection was measured.

The revised test does tick both survivors and chooses whichever actual status
reports leader (`message-group-native-custody-handoff.test.js:378–401`).
Its fixture nevertheless advances every virtual clock by zero
(`message-group-native-custody-fixture.js:39–58`).
Positive-interval scheduling therefore contributes no extra election ticks.
Status reads are already part of this explicit schedule; diagnostics serialize
the captured answers rather than entering the old leader again.

A public `raft.tick()` dispatches the tick primitive directly
(`raft-rs-operation-port.js:431`, `raft-rs-runtime-owner.js:1661–1689`);
the WASM binding calls `RawNode.tick()`
(`vendor/raft-rs-wasm/src/lib.rs:549–552`).
There is no wall-clock elapsed gate around an explicit tick.
The actual remaining issue is the scale and ownership of the timeout inputs.

The fixture overrides heartbeat 20 ms, election minimum 150 ms and maximum
300 ms, but does not pin tickIntervalMs. The repository default is 20 ms.
The ordinary MG initialization calls `resolveReplicaRaftTiming`; the
2500 ms per-index jitter makes r2/r3 minima 2650/5150 ms. The native tuning
owner computes `ceil(electionMinMs / tickIntervalMs)`, bounded below by
heartbeatTick+1. With that default, the native floors are:

| Survivor | Jittered minimum | Native election floor | Default randomized interval |
| --- | ---: | ---: | --- |
| r2 | 2650 ms | 133 ticks | [133, 266) ticks |
| r3 | 5150 ms | 258 ticks | [258, 516) ticks |

The binding supplies election_tick, heartbeat_tick, pre_vote and check_quorum,
leaving native min/max randomization at their defaults; the configured
electionMaxMs is not a native upper bound. Native followers increment their
own election counter on each tick; a vote/pre-vote received before their
check-quorum lease expires is ignored. The native randomized campaign threshold
is distinct from that lease floor.
Primary source: [raft-rs v0.7.0 Raft](https://github.com/tikv/raft-rs/blob/v0.7.0/src/raft.rs),
[raft-rs v0.7.0 Config](https://github.com/tikv/raft-rs/blob/v0.7.0/src/config.rs).

Consequently, under the repository default inputs, 200 calls cannot expire
r3's lease, and r2's randomized threshold can also exceed 200.
Initial formation succeeds by ticking r1 before the other replicas have
heard a leader; that does not establish the post-leader-loss timing premise.

**Limits of this diagnosis:** `RAFT_TICK_INTERVAL_MS` is an allowed environment
override, and the runner inherits it. Neither the job packet nor its failure
diagnostic records the resolved `service.raftTimingConfig`, each virtual
clock value, or the returned outcomes of the existing 400 tick calls.
No actual randomized timeout or native election_elapsed value is exposed by
this status. The default arithmetic is a concrete source-bound invalidity of
the fixture's sufficiency assumption and fits the measured vector; it is not
a measurement of those hidden native values or proof of one uniquely causal
random draw. A minimal next discriminator can copy the already-stored timing
config and virtual clock values, and retain results of the existing tick
invocations, without adding any status read or changing the schedule.

This is the same systematic family as the earlier project lease bug, with a
further time-scale premise. Commit
`9f7c915bb55968bcf0c84c9d19878a9c8f6c8e50` enabled pre-vote/check-quorum and
repaired a one-survivor tick schedule. Its W4 example uses
`PartitionNodeCluster`, whose explicit timing is 150 ms / 10 ms, without the
high-level MG index jitter, and a 400-round bound. It supplied the correct
two-survivor principle, not evidence that this MG fixture's 200-round bound
would suffice. Existing `raft-rs-network-host.js` similarly makes timing
windows explicit and drives the real owner clock.

No safety flag, participation gate, native role, election threshold, timeout
or round bound was changed here. Leadership transfer or forced campaign would
replace the measured leader-loss prerequisite and is not an approved repair.
Any next schedule must expose its timing premises and reach a real winner,
then retain the existing rejoin/suffix/debt assertions.

## Exact custody distinctions and category coverage

At RF1's return, one source ACK is queued and the flush timer is armed, while
the source still owes the event. The failure precedes the RF1 ACK witness.
At RF3's pre-loss flush, the source leader has applied ACK index 6; its two
source followers retain that entry but still commit/apply index 5 and still
owe the event. The review does not claim all three source replicas applied
the ACK at this cut. The recipient CDC command also remints timestamp
`1000-1-mg-custody-native-r1` and lacks the durable source occurrence fields,
although the row retains its source HLC. That source identity gap is directly
visible, separate from the unengaged suffix replacement.

| Review category | Evidence and remaining limit |
| --- | --- |
| Admission / gating / hold | Actual producer CUT_OVER and released QUERY are reached in all witnesses; RF3 survivors' identity and participation gates are open. No fabricated release or admission exemption. Full startup authorization is outside this job. |
| Recovery / replay / reconciliation | RF5 retained reopen setup is exercised. RF3 leader replacement, suffix replacement and source redrive do not execute past the failed election assertion. |
| Owner interaction | Real subscriber/bridge/topology/recipient paths are reached in RF1/RF3; S2 reaches selection and immediate-batch ownership only. Cache mutation and native committed application remain distinct. |
| Test harness / fixture fidelity | Both actual surviving ports now tick. Unbound jitter/clock scale and real batching settlement remain fixture prerequisites; no timeout or count increase is treated as evidence. Existing active observations are distinguished from passive diagnostic reads. |
| Transport / delivery / wake | RF3 two exact CDC appends are held by the real carrier; S2 records no application send at its cut. No empty error list is taken as successful dispatch or a routing failure. |
| Concurrency / locking / single-flight | Source in-flight/scan/ACK state and pending batch are inspected at the failure cut. Controller scopes close and post-fleet locks are free. No global bounded-invocation proof is supplied by these baseline tests. |
| Formation versus steady-state circularity | Real initial RF3/RF5 formation does not prove post-leader-loss election or S2 later-metadata escape. The test stops before either circularity can be resolved. |
| Retry / redrive / follow-up | No source rerun occurred during evidence retrieval. S2 provisional scan continuation and RF3 post-loss redrive remain unmeasured. |
| Sweep / timer / periodic enforcement | Positive-interval native timers cannot run under advance(0); direct native ticks do run. Real topology timer dispatch is pending at the cut. No added passive diagnostic is allowed to actuate those owners. |

The prior failed #986, #1026 and #1049 attempts remain separate evidence.
This review approves faithful preservation and use of the engaged failure
boundaries as baseline evidence only. It does not approve source correctness,
fixture repair, or any new lab execution.

## Final artifact disposition and review completion, 11:28 UTC

The original S2 child TAP remains **UNAVAILABLE**. Root commissioned a distinct
read-only artifact collector, [#1126](https://github.com/psvensson/lagrange-lab/issues/1126),
request `a50cb2e06f794053b56d72d8af6fd0bd`, envelope SHA256
`c3bdab36faa0c26c95670da9d27127ca9b2de915cae7fc5445c0407823feb306`,
payload SHA256
`6c7ad7eab5bffb449862136910439fc422862f6cc2a8b59e899edd41548be398`.
I inspected its exact packet: driver shell, `source:null`, a required
tv-dator check, then only the original worktree HEAD check and the named TAP
read/hash/compression. There is no checkout, install, test invocation or
source workload in its command.

The collector failed at its first original-worktree identity read:
`git -C .../890bbfaa-50ff-4ff7-867c-8defc512040d/work/source rev-parse HEAD`
returned exit 128 because that directory no longer exists. It never read
the TAP, and it did not reconstruct or substitute any missing diagnostic.
The collector's COMPLETE / FAIL, exit 1 is a separate custody result; the
original #1092 result is unchanged.

[Evidence #1127](https://github.com/psvensson/lagrange-lab/issues/1127#issuecomment-6363724815)
retrieved all 707 original collector-log bytes, SHA256
`60d3244c0533ccc21d8728f5ec67b44ca1db5d015eaea57b0995cd09c4bfc616`,
stream `3ceacabbfe1c11b410339dc82f794ebe2755150b7eff7d2c844a9d8fdb5cb7c0`.
I independently verified its evidence request/envelope binding, exact
collector job/host, base64/text/local equality, whole/chunk/raw digests,
offset 0 through EOF 707 and complete/untruncated read-only result.
Collector execution, container and thermal scopes report closed.
The generic shell receipt says `source_execution_started:true`; in this
packet that means its artifact-reading shell command started, not that the
source tests were run again. The actual source field is null and the command
content establishes the narrower meaning.

Root separately reported tracing the installed retention owner, which marks
the original work directory disposable and sweeps it after terminal closure
while retaining worker identity/logs. This reviewer independently verifies
the collector's missing-path result, not an observation of the historical
deletion itself. No further search or rerun is required to label the missing
72,546 child-TAP bytes unavailable. This review makes no full-S2-JSON or
complete-child-TAP claim.

A future wrapper that preserves selected full TAP in the original worker
stream before teardown would change measurement/evidence collection and
requires its own exact review; it must preserve the original runner exit
status. This review neither implements nor approves that wrapper.

**Final disposition:** preserve #1092 as an honest, source-bound failed
baseline with verified complete worker custody. RF1's missing native receipt
and RF3's pre-loss early ACK are engaged defects; S2 dispatch and RF3
leader-loss/recovery prerequisites remain unengaged. The intact diagnostic
fragments support the named S2 queue boundary; RF3's timing inference retains
its explicit unresolved-input qualification. No production correctness,
full witness, fixture repair or additional execution approval follows.

The final verification again checks every one of the 77 manifest paths
against both disk and committed `036dc0019` blobs, confirms the source tree
still equals `21cfd917`, and checks the authored review's terminal newline
and whitespace. No source/test/metadata mutation occurred in this review.
