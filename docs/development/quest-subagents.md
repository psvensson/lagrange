---
scope: governance
status: canonical
always_load: false
source_of_truth: self
last_reviewed: 2026-10-22
---

> **Canonical source.** Delegated worker policy for Quest attempts. Reached
> from the [`owner router`](../steering/router.md).

# Quest Delegation

## Roles And Concurrency

The author owns diagnosis and implementation within the approved unit. An
independent reviewer owns verification. One integration owner decides when
accepted work joins the baseline, coordinates proof, and maintains the current
summary in the owning epic. These are responsibilities, not a fixed agent
count or mandatory separate sessions. The author cannot verify their own
source change. A standalone `class: fix` uses its existing quest record and
log; it does not need an epic solely for a summary.

Assign one writer to a changing interaction: the owner boundary, its coupled
counterpart and shared contract. Separate files or worktrees do not make
concurrent changes to that interaction independent. Other agents can investigate,
review or prepare evidence in parallel, and independent interactions can have
their own writers. Include work awaiting review, tests or integration when
assessing WIP; finish or unblock accepted work before creating more competing
work on the same interaction. Use the current summary, not another queue.

## Worker Dossier And Result

Give a worker the quest and epic links; the owned interaction and writable
scope; the candidate/base revision; sealed acceptance and applicable contracts;
reproducer and relevant prior evidence; durable findings and ruled-out causes;
and the requested result, constraints and handoff owner. Include only the
context needed for that assignment. The generated
[`command reference`](../steering/generated/solve-commands.md) owns supported
operations; there is no required generic executor file or response protocol.

The response identifies changed paths and content, evidence produced or reused
with its applicability, unresolved findings, and next actions. Record durable
conclusions in the quest log before later attempts rely on them. A worker's
claim of completion is not terminal proof; only `land` can record `solved`.

## Bounded Independent Review

Before review, identify the candidate and changed interaction, relevant
contracts, claims to verify, required evidence and exclusions. Use the matching
[`verification templates`](verification-templates/INDEX.md) to attack that
surface, with evidence paths for applicable items. For a design that changes an
owner boundary or recovery semantics, use the
[`design note template`](verification-templates/design-note-template.md) and
review that design before dependent implementation. Routine local hypotheses
do not each need a separate ceremonial review.

Reviewers inspect the agreed surface and return all reachable material findings
in one consolidated response, grouped by category and severity, with evidence
and the failed contract. Do not stop after the first defect. Distinguish
blocking defects from optional improvements and unrelated findings; route
unrelated work to its owner. Review does not silently widen repair acceptance.

The author answers the complete finding set and records the next attempt.
Re-review addresses the repairs and risks they invalidate, retaining applicable
unaffected approvals. A new concrete safety defect still needs a disposition;
an earlier review does not waive it. Repeated rejection triggers judgment about
the evidence, design, owner and review scope, not a fixed round count or an
automatic user escalation.

For source landing, record independent approval with `note --verification`,
`--verifier subagent:<id>` and `--verdict approve` after the last attempt. Bind
the note to the reviewed content and evidence. A rejection remains blocking
until answered by a later attempt and, for source work, a current approval.

## Continuation And Limits

Assigned agents decide routine repairs, proof scheduling and landing under
existing authority. The user decides genuine product/scope tradeoffs or grants
missing authority. A blocked review or test needs a concrete next owner and
action. For actual asynchronous work, record its request or run, revision,
status and observer/resumption mechanism; if none exists, report the pending
action honestly. Do not imply that an idle or unavailable agent is working.

If independent verification is unavailable, continue other authorized work
that does not depend on its approval, and leave source landing blocked with
the missing capability named. Self-review cannot substitute for independence.
