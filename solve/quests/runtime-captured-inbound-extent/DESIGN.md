# Finite inbound extent at admitted execution

Base: a7e821154f1039df82bfc73ef4f2e25e4fa0468d. User authorized this bounded runtime prerequisite after reviewing W07. The complete release successor stays unsealed/unactivated; this is not release-command or merge approval.

## One existing owner

`raft-rs-runtime-owner.js` owns the group FIFO, execution admission, inbound queue, captured extent and inbound wake. `raft-rs-operation-port.js::protocolTurn` supplies existing lifecycle admission; the timer-custody module owns the acquired timer record, not another progression decision. Neither collaborator needs a new interface.

The selected contract is: after `ensureExecution` returns CORE_OK, capture `runtimeGeneration` and `group.inbound.length` together. Drain that finite extent before the command. Keep bytes in the authoritative group queue until their guarded handoff. One handled local/native refusal consumes one captured occurrence and continues through the preaccepted tail. Later arrivals cannot enlarge that extent. This is not a bound on a large preexisting batch or the future M/H/settlement scheduler.

Share `invokeCoreAt`'s current execution guard in a private helper returning its existing HOST_FAILURE/runtime-generation-changed result or null. Apply the same guard before ANY inbound mutation, including the identity-unrecorded cleanup, and before an exhausted extent invokes its continuation. Keep invokeCoreAt's own enforcement after the local-log guard. This preserves typed failures while preventing a stale continuation from removing bytes it cannot step.

## Remainder ownership by exit

| Exit or suspension | Existing custody and service owner |
| --- | --- |
| Healthy Ready/send await | group FIFO holds the current turn; inbound array retains every not-yet-stepped occurrence |
| Later accepted delivery | enqueueStep snapshots bytes and schedules or coalesces the existing referenced timer |
| Wake fires while busy | runScheduledInboundDrain retires its timer and enqueues a DRAIN turn behind the current tail; scheduled=false does not mean service is absent |
| Captured extent exhausted | selected command proceeds; later bytes retain their timer or already-queued DRAIN continuation |
| Local/native per-message refusal | that occurrence is consumed under its existing refusal owner; remaining captured tail still drains |
| Local reseed hold | existing terminal reseed owner clears the queue, retains the immediate hold and its durable-recording obligation; this is preserved failure policy, not a service-bound shortcut; no busy rearm bypasses it |
| Shared runtime replacement | stale continuation fails without dequeue; pending resumption and shared inbound wake debt belong to current-generation reconstruction |
| Persistence held | existing bounded owned poll retains bytes; expiry still leaves bytes for the next admitted operation under existing semantics, not a newly renewed wait |
| Close | lifecycle owner closes exact group, cancels owned timer and prevents stale core entry; no completion hook creates another wake |

No unconditional completion/finally rearm is proposed: the ingress wake transfers to an owned FIFO continuation. Companion evidence must verify actual processing after this transfer without another arrival or observer-driven drain. Environmental failure/reseed/permanent persistence unavailability is not a promise of autonomous successful service.

## Native proof and source comparisons

Frozen W07 Git blob debc16f442ba63b100332d93b285865d36d1c376 stays byte-identical. Its finite pressure schedule must go from first RED (4 > 1) to whole-file GREEN. Separate reviewed controls exercise two messages accepted after enqueue but before capture, acceptance during reconstruction admission if observable through existing seams, and a late remainder whose wake fired while busy. Actual native entry and reply bytes, not an enqueue ACK, are the measured endpoints.

A source-only predecessor comparison must restore the original runtime file while all final tests stay unchanged. A separate early-capture treatment must violate the new boundary control; a one-message treatment must fail the preaccepted tail control. Setup/import/timeout failures do not count. First runs and all later revisions remain separately identified.

The affected owner tests from SOURCE-CORRECTION-PROPOSAL.md remain required; the actual source delta also drives canonical changed-path/impact selection. All native work uses existing locked lab execution, unchanged deadlines and no retry-until-green.

## Scope and static debt

Baseline runtime file: 2063 lines; two cyclomatic and one cognitive finding in invokeCore/replaceRuntime, two decision-boundary findings in invalidateRuntimeGroups/replaceRuntime. They are recorded before source. The user's explicit restriction against unrelated extraction limits this review increment; no broad decomposition or raised ratchet is proposed. This packet does not claim terminal Quest landing or closure of inherited debt.

## Relevant external comparison

The libuv design describes iteration-scoped pending callbacks and defers timers that become due during timer processing to the next iteration (https://docs.libuv.org/en/v1.x/design.html, read 2026-10-15). That supports separating the current turn from later arrivals as an engineering pattern; it does not establish Lagrange generation, Ready or queue custody. No libuv numeric cap or second event-loop policy is imported here.
