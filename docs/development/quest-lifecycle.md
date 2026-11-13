---
scope: governance
status: reference-only
always_load: false
source_of_truth: self
last_reviewed: 2026-10-22
---

> **Reference-only summary.** The entry point is [`AGENTS.md`](../../AGENTS.md)
> and the binding operating contract lives in
> [`solver-quests.md`](../steering/workflow-guidelines/solver-quests.md). This
> page defines no independent command path.

# Workflow Lifecycle

## Current Vocabulary

Use the current Solver records and statuses in handoffs. The generated
[`command reference`](../steering/generated/solve-commands.md) owns the syntax.

| Record or status | Meaning |
| --- | --- |
| `start` | Validates a draft quest and its epic, measures a red `doneWhen`, and appends the seal. |
| finding | Durable evidence, a theory, an altitude check, a decision, or a ruled-out approach. |
| attempt | One hypothesis/change/measurement cycle; `note --attempt` records its head and changed paths. Individual commands and red/green observations are not separate attempts. |
| assignment | The current package's paths and existing authority reference, appended with `note --assignment`; an amendment changes the assignment, not the seal. |
| verification | Independent reviewer identity, reviewed content and evidence, and `approve` or `reject`. |
| `open` | Work is unfinished and has no outstanding recorded hold. |
| `blocked` | A recorded hold names the next owner class (`judgment`, `verification`, or `authorization`); its text identifies the concrete owner and missing input. |
| `solved` | `land` measured the sealed `doneWhen` green, passed the guards and proof, committed the scope, and recorded the terminal entry. |
| `exhausted` | A terminal note records why no honest remaining move exists in this unit. |
| `superseded` | A terminal note records why the sealed premise no longer applies and identifies its replacement where known. |

`probe` measures and projects state; `board` lists open work. Neither starts a
test job or schedules continuation. A later attempt or typed finding clears a
`blocked` hold in the current projection. This includes the typed finding written
by `evidence add`; evidence upload is therefore not a hold-neutral observation.
An untyped finding or assignment preserves the hold. If evidence custody must be
recorded while the missing input remains unresolved, record that input again with
`note --blocked` before handing off or claiming continuation. Do not describe the
temporary `open` projection as evidence that the missing input was supplied.

`blocked` is a resumable hold; `solved`, `exhausted` and `superseded` are terminal
states. Terminal Quests accept no new entries. Correct a terminal record in the
current open owning/successor record, linking the immutable original.

## Progress And Handoff

Report the bounded result and its limit: which witness changed, which owner
interaction is accepted, which wider service condition remains unproved, and
what happens next. Diagnosis that moves the suspected owner or mechanism is
useful learning, but is not a passing acceptance result.

A solved repair can integrate while the service milestone remains open for a
different failure. Service readiness and release publication require their own
existing acceptance evidence. Scheduling descriptions such as "awaiting test"
are prose in the current epic summary, not additional Solver statuses; identify
the actual request or run, revision, and owner or mechanism that will resume it.

Historical logs may retain Solver v1 events. They remain append-only evidence;
their former frontier, rung and executor operations are not current commands.
