---
scope: governance
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-10-22
---

> **Canonical source.** Quest closure and failure migration policy. Reached
> from the [`owner router`](../steering/router.md).

# Quest Closure

## Repair, Milestone And Release

Close the claim the unit was sealed to prove. A bounded repair is accepted
when its reproducer and affected interaction meet the sealed `doneWhen`, the
required independent review is current, and the landing guards and change
proof pass. It may then close and integrate even while a wider distributed
scenario remains red for a separately identified cause. Record that limit.

The distributed service milestone retains its own end-to-end acceptance. A
repair receipt does not close it. Publication or release retains the exact
candidate gates and receipts owned by the existing publisher and release
process. Conversely, do not make every bounded repair wait for unrelated
milestone or release proof. Scope these claims correctly before sealing;
existing sealed acceptance changes only through explicit supersession.

## Solved

A quest is `solved` only when `land` measures its sealed `doneWhen` green,
passes every required guard and proof, commits the scoped tree, and writes
the terminal entry. Record the final attempt and applicable independent
verification before landing. Probes read or evaluate evidence; invoking a
probe does not request a harness job.

Use existing provenance and proof-selection rules to determine what must run
again. Retain applicable earlier evidence and run the missing or invalidated
proof. `land` still performs its own measurement and required gates; final
publication still proves the exact candidate. Cite the terminal record, commit
and evidence in the handoff, together with any broader condition still open.
An optional human report is a view of those records, never a prerequisite or
an alternative source of the verdict.

## Blocked, Exhausted And Superseded

Use `note --blocked` when a real missing input prevents continuation. Its
`--next-owner` is the existing class `judgment`, `verification` or
`authorization`; name the actual agent, role or user and the needed input in
the text. Routine implementation judgment, audit repair and authorized landing
belong to the assigned agents. Ask the user only for a real product/scope
decision or authority that the session and repository do not already provide.

An unavailable reviewer, occupied runner or session ending does not exhaust
the repair. Record what is pending and the next action. For a requested run,
link the request or run id, revision, workload and status, plus the owner or
mechanism that will observe it and resume. If no run is submitted or no
continuation exists, say so; do not describe work as queued, running or
automatically resuming. Resolve the hold through a later attempt or typed
finding only after its missing input is available.

Use `note --exhausted` when evidence establishes no honest remaining move in
this unit; record the ruled-out approaches and why. Use `note --superseded`
when the sealed premise no longer applies, naming the replacement when known.
Both are terminal, append-only outcomes. Do not manufacture a passing result
or silently change the sealed predicate to obtain closure.

## Failure Migration

When an attempt moves the dominant failure, record the previous failure, new
failure, supporting evidence, and the interaction and owner that now need work.
Then evaluate the original repair's sealed acceptance separately. If it is
satisfied, close the repair and route the new cause to its owner. If it is not,
keep the quest open or explicitly supersede an invalid premise. Diagnostic
movement alone never implies `solved`; it should prevent the next attempt
from rediscovering an already ruled-out cause.
