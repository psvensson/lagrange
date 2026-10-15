# Proposed first runtime source increment - not implemented

The first native W07 run supplies the missing causal observation: live inbound
arrivals during one Ready/send await extend the selected operation's drain.
The correction belongs to the existing runtime turn owner, not release callers,
transport retries, another queue authority or timeout policy.

## Exact proposed boundary

| Existing function/owner | Proposed change / preserved obligation |
| --- | --- |
| `raft-rs-runtime-owner.js::perform` | After execution/reconstruction admission, capture this turn's generation and finite pending inbound extent exactly once. Preserve all messages already pending at this cut. |
| `drainInbound` | Consume only that captured extent across Ready awaits. Each accepted occurrence remains in the existing group-owned queue until its guarded handoff; later arrivals cannot increase the remaining count. Native per-message refusals still consume their occurrence and continue through the preaccepted tail. |
| `enqueueStep`, `scheduleInboundDrain`, `runScheduledInboundDrain` | Leave later arrivals and their unchanged bytes with the current group queue. Preserve/coalesce its existing owned wake. If a captured turn leaves work after an earlier wake was consumed, reoffer that same owner wake; do not create a second driver, detach an untracked batch or prepend maintenance ahead of an unknown incumbent. |
| `enqueue`, `releaseTurn` | Existing accepted commands retain FIFO custody. A yielded inbound remainder cannot recursively extend a command's captured turn or erase another accepted turn. No new priority authority. |
| `invokeCoreAt`, `drainReady`, shared reconstruction/resumption | Keep actual generation checks at every asynchronous continuation. Validate custody before consuming an occurrence; a stale continuation must not drop it before failing. Reconstruction and current-generation wake own resumption. Ready persistence/application ordering stays intact. |

For this trace the captured extent is one; the valid two-message preaccepted
CA1/M9 tail must still drain completely. A blanket limit of one message per
command would break that existing contract. Keeping the queue authoritative,
rather than moving it into a detached local array, avoids creating a second
recovery owner for unprocessed accepted bytes.

This closes only finite captured service under recurring arrivals. The full
selected service rule also includes an owed tick and reviewed M/H/settlement/
ordinary lanes. This test exercises an ordinary existing proposal, so it does
not prove future lane priority, intake capacity, all-caller fairness or a
constant service-time bound for arbitrarily large preexisting batches. Finite
intake and exact pending/core/Ready/suffix reconstruction remain separate I2/I3
prerequisites. Do not label this increment a working release protocol.

## Acceptance matrix when source changes

| Required check | Required evidence |
| --- | --- |
| Frozen W07 file, same test blob `debc16f...` | Whole file passes at the new exact source: service count <= 1, four exact occurrences/replies preserved; all three controls retain their actual outcomes. Keep current first RED immutable. |
| Capture-point witness | Separately prove that input accepted after a command queues but before its admitted `perform` turn starts is included before that command. W07's <= 1 bound also permits zero and cannot by itself distinguish capture at enqueue from capture after `ensureExecution`. Keep the frozen first-run test unchanged. |
| Minimal behavioral mutation or source reversion | Same test inputs recover the intended late-service assertion, not a missing symbol or changed bound. |
| `runtime-turn-integrity.test.js` | CA1/M9 preaccepted refused-plus-valid tail and CA5 nested event-reader semantics remain correct. |
| `inbound-drain-owned-timer.test.js` | Referenced accepted-work wake, persistence wait, replacement debt, retry, closure and timer ownership remain intact. |
| `operation-port-ready-recovery.test.js`, `persistence-admission.test.js`, `durable-ready-loop.test.js` | No regression in deferred Ready, actual persistence boundary, application atomicity or held connection behavior. |
| `runtime-trap-and-restore.test.js`, `runtime-replacement-review.integration.test.js`, `runtime-load-recovery.integration.test.js`, `lifecycle-registry-runtime-generation.test.js` | Current-generation resumption, group/shared failure scope, exact lifecycle and replay remain intact. |
| Source-specific changed-path/static/impact gates and independent review | Recompute the cone from the actual increment, retain inherited unrelated failures separately, and satisfy current style/size owners without broad cleanup or ratchet increases. |

Add a boundary-specific remainder witness only if the implemented wake handoff
introduces an uncovered exit: queued remainder across an already-fired wake,
per-message refusal, close or generation loss must be retained or explicitly
owned, never silently drained by an observer. Do not rerun unchanged recorder,
ROLLBACK or design projections as substitutes for these source-dependent checks.

## Dependencies kept with their existing owners

I1-I6/W01-W12 remain on the complete partition release unit in the accepted
`protected-release-closure-20261015/NATIVE-IMPLEMENTATION-PLAN.md` at ec6a14832.
This packet does not approve production compound command/codec/result schema,
M/H custody-discard reconstruction, pressure-safe deterministic application,
write/TX1 immutable bindings, activation, prefix/application provenance,
durable query discharge, COMMIT/ROLLBACK settlement, deadline handoff, finite
encoding/retention or the existing application-image/native-import work.
No parallel snapshot path or capacity authority is proposed. Both accepted
pressure directions, D3/D4 and supported snapshot recovery still belong in
one complete implementation unit before protocol acceptance or merge.

Stop for content-bound review of this native evidence and proposed source
increment. No runtime source, timeout, release command or protocol model was
changed in this packet.
