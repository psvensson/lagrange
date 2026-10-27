---
documentClass: planning
---

# Independent source review: F3 and topology owner repair R1

Reviewer: `subagent:/root/retained_effects_review`.

Verdict: **REVISE: O1 and O2 below.** These are the complete material findings
from this bounded differential review. The four F3 edits and the retained
durable custody/coverage mechanics require no additional correction in this
round. No source or test was edited and no runtime or lab was executed.

## Exact reviewed scope

Worktree: `/mnt/data/peter/projects/.worktrees/mg-source-occurrence-delivery-20261023`.
Base HEAD: `21cfd917d8ceb2f0c1435cade117c0c44a91a03a`.
Author: `subagent:/root/retained_effects_tests`.

The frozen bundle is `/tmp/mg-owner-static-repair-20261023`:

| Artifact | SHA256 |
| --- | --- |
| `manifest.json` | `fc9b8a418a18d59e3b5cb16f1ff0a7e6e22ab3fd4ba56298c41a416d9c45f405` |
| `delta.patch` | `c2b3b5c27a7840780752322113fc32b22d48ac0e47e92821a820fec0eea5fc84` |
| `NOTES.md` | `8c95cc8807065588523ec4169661f36a762ef898f026964dfdaa728163f47584` |

All seven preserved before/after pairs, live after files and listed artifact
hashes match the manifest. The scope is the exact delta, not approval of the
entire concurrent MG draft, root progress owner, canonical vector implementation
or my own earlier source work.

## O1: enforce stop after the new async helper boundary

**Category: concurrency / retry / lifecycle.**
`src/topology/cdc-group-propagation-delivery-methods.js:97-108` awaits
`waitForForegroundRetry`, then trusts the returned state without observing
the lifecycle again. The helper is async even when it immediately returns
SPENT at `:113`. This introduces a real continuation gap that the former
inline check/break/report sequence did not have.

A finite ordinary-path counterexample is: one target returns an ordinary
failure on the final foreground attempt; the helper observes RUNNING and
returns SPENT; `stop()` runs before the outer await continuation; the outer
method then emits the spent report, calls its spent hook and returns the
original failure array instead of the typed `propagation_stopped` result.
The existing background timer owner still refuses to arm while stopped, so
this finding does not claim that a timer necessarily survives STOPPED. It is
the lost stopped disposition and stale post-await decision that violate the
retained owner contract.

Re-enforce the existing stop owner immediately after the helper await, before
SPENT/ADVANCE consumption. Preserve a STOPPED result already observed by the
helper even if a later start clears the current state; the new named state is
useful for that case. Do not replace the check with a new independent lifecycle
flag or grant. If the source is refactored to avoid a new immediate-return
yield instead, it must still enforce stop after every actual wait.

The historical owner and counterexamples already exist:
`cdc-group-propagation-lifecycle-methods.js:46-90` owns typed stopped failures
and sleep release; `cdc-group-propagation-service.js:182-190` stops the service
and releases held sleeps. The stop-settles test's round-3 cases at
`test/topology/cdc-group-propagation-stop-settles-deliveries.test.js:227` cover
stop during an in-flight attempt for both maxAttempts 3 and 1. The added helper
boundary needs the corresponding deterministic stop-before-consumption control.
It must prove the typed stopped answer, no retry/spent handoff, and no later
attempt, with an un-stopped control that retains the same foreground cadence
and exhaustion behavior. No such execution is claimed here.

## O2: distinguish attempt exhaustion from insufficient remaining time

**Category: retry / owner interaction / diagnostic accuracy.**
`waitForForegroundRetry` returns the same SPENT state for `attempt >=
maxAttempts` (`delivery-methods.js:113`) and a durable wave that cannot afford
the next delay (`:115`). Both reach the ordinary foreground spent reporter
at `:103-105`.

The actual diagnostic owner,
`src/topology/cdc-group-propagation-retry-wait-report.js:7-13,32-48`, identifies
the spent bound as `CDC_GROUP_PROPAGATION_RETRY.MAX_ATTEMPTS` and describes
foreground failures handing over to background retry. For a durable wave
with maxAttempts 3, attempt 1, a 100 ms next delay and only 50 ms remaining,
neither statement is true: attempt capacity remains and the durable operation
deliberately has no background callback
(`cdc-group-propagation-durable-delivery.js:142-148`). Even genuine durable
attempt exhaustion has no background handoff. Transport acknowledgment also
does not name the durable wave's full native/provisional coverage predicate.

Keep the common attempt/cadence owner, but carry a truthful named stop reason
and report it through the existing diagnostic owner with the appropriate
durable continuation semantics. Preserve ordinary max-attempt/background
reporting. Do not restore a second durable retry loop, add a background durable
entry, or silently remove the spent observation to satisfy this finding.
An unresolved aggregate-wave diagnostic count of one is acceptable when
explicitly described as such; it must not be represented as a measured number
of uncommitted leaves.

Required controls distinguish: ordinary exhausted attempts with the existing
background handoff; durable exhausted attempts with source-owned continuation;
and durable insufficient remaining duration before maxAttempts, with no sleep
or subsequent attempt. Each must assert the actual named bound/reason and
absence/presence of the correct continuation, not only a logger call count.

## Unaffected behavior and category-complete assessment

The F3 target traversal is a bounded walk of already selected candidates, not
a new retry cadence. `durableForwardTargetStep` preserves the exact precedence:
canonical accepted result wins; otherwise native-terminal or nonretryable error
stops; otherwise the next candidate is considered once
(`message-group-forwarding-owner-native-delivery-methods.js:137-140,201-215`).
The last answer/error and addressed-convergence accumulation remain unchanged.

The new CACHE_SELECTION_REQUIRED result replaces exactly the former internal
null (`message-group-forwarding-owner-routing-methods.js:143-145`); its one
live consumer continues only for that named state
(`message-group-forwarding-owner.js:296-303`). Native terminal/group refusals
remain complete decisions. The normalizer edit only renames the filtered
array and adds braces (`message-group-service-cdc-propagation-runtime-methods.js:324-340`);
the existing indexed two-pass timestamp/cause/replay semantics are unchanged.

| Category / attack | Evidence and disposition |
| --- | --- |
| Retry: firing, bounds, exits, storm ceiling and reset | O1/O2 are the required corrections. The common foreground loop retains `max(1, deliveryRetryMaxAttempts)` and the same `computeRetryDelayMs(attempt)` (`delivery-methods.js:89-123,669-673`). Ordinary conversion after wait, failed-target-only next wave and maxAttempts+1 background entry remain in `prepareOrdinaryForegroundWave` (`:57-80`). Durable waiting remains strictly less than remaining parent time and uses the same existing sleep (`durable-delivery.js:142-145`). No retry count or timeout is raised. |
| Concurrency: synchronous gate, awaits, claims, reentrancy and scope | O1 names the new stale observer gap. Durable admission still precedes capture and every await (`durable-delivery.js:170-181`); one exact child cleanup releases only its own active slot (`:182-184`). The serial leaf window and source-owned rotating progress are unchanged (`:88-113`; `src/cdc/cdc-propagation-progress.js:92-117`). No async row read replaces the synchronous slot and no second single-flight key is introduced. |
| Owner interaction: semantic owner and typed seam | The existing `deliverToTargetsWithRetry` owns attempt count, cadence and spent handling. Its private prepared operation supplies owner-local actions, not a serialized grant or new registry. O2 requires the diagnostic owner's text/reason to match that composition. No ordinary batching, pressure preparation or background path runs for the prepared durable operation (`delivery-methods.js:90`; `durable-delivery.js:195-196`). |
| Owner interaction: paired invariants, pressure and release | Prompt bounded refusal must coexist with retained raw cleanup. The durable wait remains `context.run(() => owner.sleep(delayMs))` and slot release still awaits child cleanup; it is not released by the outer response (`durable-delivery.js:145,179-184,199-200`). A failed or provisional wave creates no durable background timer. Pressure remains checked per actual target (`:64-85`). Same-candidate held-child, pressure-release and fair-target controls remain required. |
| Owner interaction: projection, stale-then-fresh and no escape | Completion still consults canonical `progress.result()` and committed/provisional validators, not failureCount, ACK or diagnostic cause (`durable-delivery.js:116-149`). Route refresh remains with the bound progress owner. `progress.result()` revalidates actual topology/source lifetime and complete coverage (`cdc-propagation-progress.js:106-145`); a stale answer cannot become completion merely because the new loop sees no delivery exception. |
| Owner interaction: treatment and registry | A source-only static refactor is not an executed paired witness. Root retains impact-contract/metadata registration and exact-candidate lab selection. The required negative controls must restore the O1 stale decision and O2 conflated report independently; neither a setup miss nor import error counts as a kill. |
| Admission/gating | BUSY remains before capture/effects; source mismatch remains after the admitted plan observation and before publication mode/delivery (`durable-delivery.js:173-194`). The named disposition functions reproduce the prior branches. No opening, cache readiness, native participation or publication authority is granted by these states. |
| Transport/delivery | No callback, transport response, native receipt or event identity shape changes. F3 still validates canonical complete/provisional answers and checks target/currentness before and after transport (`native-delivery-methods.js:176-234`). Durable coverage is never inferred from the diagnostic failure count. Full transport/native acceptance remains independently gated. |
| Recovery/replay | The source progress cell, original occurrence binding and native ACK owner are unchanged. Fair cursor/coverage retention survives attempts; no payload journal or background recovery owner is added. This differential review does not approve missing original-startup evidence custody or full recovery. |
| Sweep/timer | O1 concerns the post-helper await; O2 concerns naming the actual spent bound. Real delay remains owned by `cdc-group-propagation-lifecycle-methods.js:65-90`, which stop can release. No new timer primitive, polling loop, native tick or role mutation is added. |
| Formation circularity | Canonical provisional coverage can still end a complete provisional wave without producing a durable source ACK (`durable-delivery.js:120-126`). Partial coverage remains unknown, allowing source-owned bounded re-drive. No metadata-readiness bypass or self-hosted queue is introduced. Native S2 engagement is still a separate runtime prerequisite. |
| Harness fidelity | No test was changed or executed in this bundle. Existing stop-settles/stop-arms-nothing tests remain relevant but do not by themselves prove the newly introduced continuation gap or durable diagnostic branch. The required controls must use actual owner stop/sleep/attempt boundaries and disclose controlled scheduling. |

The new tagged last-failure record is diagnostic only. Actual coverage is
observed before that record is assigned (`durable-delivery.js:103-110`), and
success still requires the canonical complete result. The extra result
observation can fail closed on a newly invalid route; it cannot promote an
unknown answer into native completion. No new hostile-input validator is
introduced by these seven diffs; separate input-owner findings retain their
own approval gates.

## Static verification and limits

I independently ran all seven syntax checks and normal scoped ESLint; all
exited zero. The frozen reports match their manifest hashes. Their differential
complexity count is 13 to 12, removing only the old foreground method's
complexity-19 finding; the twelve remaining messages are unchanged. Decision
findings decrease 13 to 4 and literal findings 1 to 0. This is not global debt
clearance or runtime proof, and no baseline/checker was changed.

All seven live and archived after hashes and the manifest were rechecked at
the end; none changed. I wrote only this new review. Root must preserve this
rejected R1 bundle and bind the eventual bounded repair to new exact hashes
before source approval or a candidate lab claim. No approval of native
delivery, full classification, activation, transfer, two-start, Quest closure,
publication or merge follows from these static checks.
