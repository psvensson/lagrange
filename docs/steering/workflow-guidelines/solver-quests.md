---
audience: agent
last_reviewed: 2026-11-13
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

For a major feature, define the user journey in its existing owning specification
before implementation and apply the
[feature-journey policy](../../../test/guidelines/release-gate.md#major-feature-user-journeys)
when sealing and reviewing completion. That policy keeps bounded repair and
feature acceptance distinct; it adds no second acceptance record or gate stage.

## Causal scope

Treat an unexplained failure as potentially systemic until evidence bounds its
cause and affected interaction. Read relevant recurrence history and analogous
owner contracts before settling on a local repair. This is a causal inquiry,
not a requirement to census the whole repository for every routine edit.

Account for the producer, consumers, production binding, retained obligations
and necessary witnesses. Change only the parts needed to repair and prove that
interaction. A coupled-pair selection identifies proof obligations; it does not
authorize editing every selected owner. Split unrelated outcomes into separate
units, while keeping a contract change and its invalidated callers together.

Before writing, record the writable paths or owner boundaries, candidate/base,
dependencies and material exclusions in an existing Quest finding or, for a
direct change, its review description. An epic's `authorizes` is an outer
boundary, not the worker's assignment. Record a necessary scope amendment under
existing authority before editing beyond the assignment, and reassess affected
review and proof. A changed sealed premise still requires explicit supersession.
Route unrelated discoveries to their owners. The current executable scope
limits are described in [Workflow Validators](../../../docs/development/quest-validators.md);
an unsupported record field does not create a guard.

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
production failures. For each material claim, name a reachable counterexample
and its discriminating witness; a green primitive does not certify an operation.

### Contract-first transition record checklist

Before any behavior-changing attempt, record the complete transition in the
quest log or transition note:

1. **Producer and consumer symbols**: Name the exact canonical endpoints,
   functions, exported types and affected callers. Census existing implementation
   and actual binding APIs before proposing new machinery; an upstream API alone
   does not establish that this repository exposes or consumes it.
2. **Owner-defined shape**: Define concrete types and schemas owned by the
   producer; no untyped facades, hand-written duplicate shapes, or phantom
   fields.
3. **Identity and generation**: Trace subject/domain, authority, incarnation,
   epoch, term, or generation through every hop; name the meaning of a read
   version separately from a routing or membership epoch.
4. **Ordering**: Specify event sequences, causal position, and monotonic
   watermarks. Distinguish a local view, a per-owner freshness fence and a
   consistent cut across owners; identify the mechanism supporting the claim.
5. **Absent versus unavailable**: State explicit typed unavailability when
   authority is absent or uninitialized; zero silent fallback reads or default
   guesses.
6. **Durable commit**: Name the exact monotonic persistence point where the
   transition becomes authoritative.
7. **Retained obligations**: Account for in-flight operations, uncommitted
   leases, cold holds, and pending mutations.
8. **Canonical wake and cleanup**: State the event-driven progression, resource
   disposal and deregistration paths. Distinguish cancelling a wait, stopping
   execution, releasing resources and settling effects already committed.

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
When a recorded decision refines a general instruction, update the canonical
owner guidance in the same change and preserve the historical decision.

A change under `src/` lands only behind independent approval newer than the
last attempt, naming the verifier and reviewed content. The same review
requirement applies to changes that select, execute, interpret, admit or publish
proof, including harnesses, fixtures, thresholds, configuration and operative
acceptance prose. File extension alone does not make a change inert. Ordinary
explanatory documentation retains the direct-change route; this does not exempt
source edits from their existing review requirement.

A standing rejection blocks landing until answered. Review must remain bound
to the actual candidate and acceptance inputs; retain unaffected approval only
where the existing provenance and proof-selection owners establish applicability.
The [validator owner](../../../docs/development/quest-validators.md) distinguishes
this policy from the narrower automatic review trigger. Use the same independent
review record, without adding another approval stage.

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
