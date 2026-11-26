---
audience: development
last_reviewed: 2026-11-26
---

> **Canonical source.** Quest closure and failure migration policy. Reached
> from the [`owner router`](../steering/router.md).

# Quest Closure

## Repair, Milestone And Release

Close only the sealed claim under
[Separate Acceptance Claims](../../test/guidelines/release-gate.md#separate-acceptance-claims).
A bounded repair can close and integrate while a different recorded cause keeps
the wider milestone red. Record that limit and route the remaining cause. A
repair receipt does not discharge service or exact-candidate release acceptance;
a changed sealed premise requires explicit supersession.

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
automatically resuming. A later attempt or typed finding clears the current
projection's hold, including the finding written by evidence upload. If custody
must be recorded before the missing input is available, re-record the unresolved
hold before handing off or claiming continuation; see the
[lifecycle side effects](quest-lifecycle.md#current-vocabulary). Untyped
observations and assignment findings preserve the hold. An `open` projection
alone does not establish that the missing input was resolved.

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
