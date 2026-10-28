---
audience: agent
last_reviewed: 2026-10-28
---

# Quest workflow

Conditional: read when starting, recording, scoping or landing a unit of
work. Rules R15 to R23 own the invariants. The generated
[`command reference`](../generated/solve-commands.md) owns the CLI.

## Choosing the unit

Work likely to need more than one measured attempt, or that changes an owner
boundary, is a quest (R15). Commit a single-sitting change with an obvious
proof directly, naming its witness. Define a bounded repair by its reproducer
and affected interaction. Keep the distributed service milestone and release
acceptance in their existing owning contracts. An accepted repair can close
and integrate while a wider scenario remains red for another cause.

A quest directory holds its record, append-only log and required evidence.
The record names the statement, owning epic (or `class: fix`) and one
`doneWhen`. `start` validates it and seals only against a measuring red probe.
Do not weaken a seal to close work; explicitly supersede a changed premise.
When a unit of work needs a quest and none exists yet, prepare a bounded
quest proposal (statement, owning epic, reproducer, `doneWhen`) and take the
next authorized action; the missing record is not by itself a reason to stop.

## Contract-first owner work

Before adding or repairing a workflow, permit, recovery path or state store,
apply the approved [authority and recovery principles](../../../architecture/contracts/authority-and-recovery.md):
one owner per authoritative fact; disposable projections; no circular recovery
prerequisite; one decision algorithm with multiple legitimate triggers; an
owned consequence for refusal; and abstractions that reduce reasoning.

Record the complete transition before implementing its parts: trigger,
authoritative facts, permitted action, actual durable commit point,
restart/lost-answer behavior and every remaining obligation's owner. Use
existing owners first. Distinguish boundary-only tests from reachable
production failures. A green primitive does not certify a complete operation.

This is an application of existing rules, not a new fixed subsystem count or
permission to rewrite sealed acceptance. The current bounded cutover work is
routed through the existing epic's [contract-first plan](../../../solve/epics/raft-rs-full-cutover/contract-first-2026-10-08.md);
broader convergence retains its own activation gate.

## Decision owners and work in progress

The author owns routine diagnosis and repair; an independent reviewer owns
verification; one integration owner coordinates acceptance, proof and landing.
Existing authority persists. Judgment, audit repair and authorized landing do
not automatically require a human stop. Ask the user for a genuine product or
scope decision or missing authority after resolving what the records allow.

Use one writer per changing interaction and serialize its integration. Parallel
investigation, review and independent interactions remain useful. Count work
awaiting review, test and integration as WIP. The integration owner maintains
one current summary in the epic, linking the baseline, blocker, active work,
evidence and next owner/action; authoritative records retain their own claims.
For a standalone `class: fix`, the existing quest record and log suffice.

## Recording and review

Append findings, attempts, verifications and terminal entries. An attempt
records its head and changed paths. Correct history with a new entry (R21).
Bound review to the candidate, affected interaction and acceptance. Return all
reachable material findings together, then review repairs and what they
invalidate. Retain applicable unaffected evidence; do not broaden acceptance
or impose a fixed number of review rounds. Route unrelated findings to owners.

A change under `src/` lands only behind independent approval newer than the
last attempt, naming the verifier and reviewed content. A standing rejection
blocks landing until answered. Evidence reuse needs applicability under the
existing provenance and proof-selection rules, not an assertion of sameness.

## Landing, publication and continuation

`land` measures the sealed probe, enforces scope, interaction and static guards,
proves the staged change, commits and records `solved`. It never pushes.
Publication proves its exact candidate through the existing gates (R22, R23).
Neither repair acceptance nor an earlier receipt grants broader readiness.

When an input is missing, record why, the actual next owner and action. A
pending run needs its request or run id, revision, workload, status and an
owner or mechanism that will observe and resume it. If none exists, report the
pending action; do not claim background execution. Unavailable measurement is
not exhaustion. Record `exhausted` only when no honest remaining move exists,
or `superseded` when the sealed premise is gone.
