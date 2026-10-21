---
audience: development
documentClass: current
---

# One participant-release completion operation

The current seed workflow and releaseFreshCreate independently classify
CUT_OVER, NOT_LEADER and reply retryAfterMs, enforce the remaining deadline,
wait and repeat. The existing-origin recovery queue cannot replace either:
it needs a durable origin, uses another trigger and its own recovery budget.
The earlier seed cohort seal explicitly preserves the caller's initiation
role, shared original deadline, retries and failure projections.

Extend the existing participant-release client with
completeParticipantRelease(owner, request, clock). The clock supplies now
and sleep execution primitives only, never a retry predicate, outcome
classifier, deadline factory or authorization. A captured request retains
the original absolute deadline and all original authority identities.

One owner interprets each response: CUT_OVER ends completion; NOT_LEADER
uses PAUSE_RETRY_AFTER_MS; other responses use their actual retryAfterMs.
A safe integer, nonnegative delay must fit the original deadline before a
wait is prepared. Read the remaining budget once in preparation. For
FRESH_CREATE a nonpositive remainder ends completion without waiting; for
FRESH_SEED preserve its existing zero wait. Both use their original timing
substrate and repeat only while the original clock is at or before the
original deadline. A returned envelope retains the exact answer and counts
attempts. First blockedDrain/joinedAttempt reads are seed-only, preserving
fresh CREATE's lack of diagnostic reads. No finite liveness is claimed for
a zero-delay answer and a clock that never advances.

Seed still selects control-first distinct cohorts, builds its original
single pass deadline, authorizes each cohort once, delegates completion once
per cohort and projects the original failure. Fresh CREATE still measures
build, validates its deadline and obtains create authorization; it delegates
once and returns the exact successful answer or its original failure form.
The single-attempt client and its one redirect remain unchanged for nested
control and operator. The background recovery queue is unchanged.

Complete operation: fresh seed/CREATE trigger -> current caller authority
and unchanged deadline -> repeated intent to the same release route ->
existing receiver performs any ENABLE/OPEN durable effects -> a lost answer
is reconciled by that same owner -> a terminal refusal retains existing
origin/recovery/cleanup obligations. Completion is not permission and never
deletes a committed fact or discharges native resources.

The local-retry audit must not merely exempt the new path. Reuse the
repository's partition-class-owner pattern: inspect callers and validate a
narrow owner-body AST contract including inputs, exact guard operators,
statement order, imported primitive/constants and loop continuation. Load
the owner when checking selected callers. Only the validated loop node is
owned. Unsupported structure fails closed. The seed's distinct-cohort outer
loop remains valid; another same-intent retry loop does not. Copies,
unvalidated owners, spoofed bindings, deadline renewal, caller predicates,
duplicate delay classification and nested control completion are negative
controls. This is a bounded interaction audit, not a general JS proof.

Before production repair, freeze behavior witnesses through current seed
and fresh-create entries. Preserve clock boundary schedules, seed first
observations, original authority/deadline identity, success/refusal identity,
wait rejection, invalid and zero delay, NOT_LEADER delay, and actual re-drive.
Then run the same witnesses on the shared operation, existing native and
protocol regressions, structural negatives, scoped audits and independent
category-complete review. Record source-only negative limits separately
from distributed or restart certification. No earlier seal is rewritten.
