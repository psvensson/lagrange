---
audience: development
documentClass: current
---

# Authority and recovery

Owner: architecture. Approved direction: user instruction of 2026-10-08.
This elaborates steering R01-R05, R09-R14 and R18-R23; it does not create a
parallel runtime framework or reinterpret a sealed Quest.

## Guiding principles

### One owner per authoritative fact; projections are disposable

Name the fact before naming a component. Declared placement, admitted work,
committed Raft membership, physical replica generation, storage reservation
and cleanup permission are different facts. Each has one semantic authority.
A helper, observation, diagnostic record or cache does not need another
independent decision owner. A projection may trigger reconciliation but cannot
grant permission, discharge an obligation or declare completion on its own.
Not every decision must be durable: persist what safety and recovery require;
recompute disposable schedules, indexes of work and presentation.

### Recovery must not depend on the condition it restores

Name the minimal facts required for each recovery action. Their acquisition
must not depend circularly on full serving readiness, current derived views
or completed optimization. Feedback loops are legitimate; circular admission
prerequisites are not. Intact local restart, known destructive loss, snapshot
installation and temporary read unavailability are distinct owner decisions.
Bootstrap is a smaller operating mode with a complete handoff, not a second
steady-state implementation. This rule does not waive authorization, durable
identity, quorum, election-safety or application consistency requirements.

### One decision algorithm, multiple legitimate triggers

Events, timers, retries, restart scans and operator requests may all be normal
reconciliation triggers. They converge on the same owner, durable facts and
transition rules. Periodic reconciliation is not inherently a fallback.
Eliminate competing completion/admission/progression algorithms, not timers
merely because another trigger also exists.

### A refusal has an owned consequence

A recoverable refusal identifies the missing fact, its owner, and the event,
retry deadline or explicit operator action that can cause reconsideration.
Fail closed without silently abandoning an acknowledged or admitted
obligation. Permanent refusal is explicit and cannot disguise an endlessly
retrying operation. Recovery may preserve an unresolved obligation after the
ordinary request has settled; it must not invent success to release it.

### Participant release observes a held runtime through one continuation

The replica handler's participant-release recovery queue is the volatile
continuation owner for hosted partitions whose Raft runtime reports the
canonical host-held status. It reuses the write kernel's held-status
classifier and the existing `PARTICIPANT_CUTOVER_BOUND.RECOVERY_RETRY_MS`
cadence. It does not consume the runtime status's relative `retryAfterMs`,
drive a Raft tick or core operation, or grant release. The Raft runtime keeps
sole ownership of its reconstruction not-before instant, durable record read,
committed replay and consensus announcement.

Each observation reads current hosted services in registry order and stops at
the first current leader. Without a leader, any canonical held observation
retains one partition debt; healthy followers and candidates, absent services,
and unavailable or malformed status remain event-driven. The tracked-service
registry and consensus relay are wakes only. A later leader still must pass the
existing durable-origin, measured-build, complete-census and cutover owners.

The participant pause/resume owner remains the only owner of the final OPEN
mutation. Both an idempotent OPEN answer and a final mutation require a live
handler, a live service and the exact service object still registered for its
replica. Handler shutdown, service shutdown or replacement closes the stale
object and returns the existing stale outcome. A different release identity
against an otherwise current valid OPEN proof is stale without revoking that
proof. Recovery shutdown removes only volatile observation debt; it cannot
weaken origin, generation, membership, transaction-drain or lifecycle fences.

### A held control wave and recovery share one progress owner

The same canonical participant-release `RUNS` entry owns a held
`sql_transactions-p1` seed control wave. The original recovery queue is the
only continuation owner **after** that wave has retired; a registry/consensus
wake while the wave remains held is not permission to launch another control
`RELEASE`. The current cutover owner returns the typed
`control_wave_owned_by_current_cutover` missing fact to distinguish a current
owned deferral from missing leadership, storage permission, or an ordinary
recoverable failure.

The existing release-recovery queue must not rearm its
`RECOVERY_RETRY_MS` timer against this exact wave-owned deferral. It may still
receive events, but they do not create a second cutover decision algorithm.
The wave retains its original absolute deadline, current committed voter
identity and live admission CLOSED while held. On successful END it RESUMEs
every current voter through the original recipient and discharges its volatile
wave, with no extra recovery wake. On refused, uncertain or incomplete END it
retires its wave entry only after joining admitted children and returns any
still-CLOSED control debt through `participantReleaseRecovery.requestRecovery`
to the pre-existing queue. That queue recomputes *new* durable origin,
membership, generation, measured build and work before attempting a release;
it never treats an old wave correlation or earlier `CUT_OVER` as authority.

This is the historical **paired invariant**: repeated retry under a healthy
owner must be suppressed **and** a failed/retired owner must hand progress back.
A test passing just the first half can strand admission; a test passing just
the second can recreate the retry/repair storm. The control wave's own
bounded callback/transport obligations must be separately verified so that
a nonterminating owner cannot silently absorb retry debt. This interaction
inherits the `owner-interaction` ping-pong verification template and the
2026-09-17 owner-clock DT6 lesson: timers/waits and the deadline they enforce
must belong to one clock, not a mixture of wall and virtual time.

### Every abstraction reduces the reasoning required

A new subsystem earns its existence through a distinct responsibility or
failure boundary and names the existing decisions or interactions it removes.
No target count of files, classes or systems is prescribed. File-size and
complexity ratchets are not permission to fragment a single conceptual state
machine into opaque cooperating pieces. Share mechanisms when failure
semantics coincide; specialize policy where they do not.

### Prove complete operations, not collections of green components

For an irreversible transition record: trigger; current authoritative facts;
authorized action; actual durable commit point; lost-answer/restart behavior;
and owner of every remaining obligation. Primitive and boundary tests precede
an end-to-end witness, but cannot replace it. Distinguish a directly exercised
adapter boundary from a reachable production race. A rejected or conflicting
write is not a grant; an unknown outcome is resolved through its existing
owner, not guessed from a timeout or projection.

## State classification

| State | Purpose | Required discipline |
| --- | --- | --- |
| Declared policy | What should eventually be true | Not current consensus membership |
| Durable operation/obligation | Admitted work and what remains owed | Exact identity, commit point, recovery and release owner |
| Committed consensus facts | Applied configuration and ordered history | Supplied by the existing Raft runtime/storage owner |
| Physical generation | Which local files/worker/incarnation may act | Existing CREATE/lifecycle/cleanup fences |
| Volatile execution state | Queues, local mirrors, scheduling | Reconstructible; cannot upgrade durable authority |
| Observation/presentation | Explain progress and trigger reevaluation | Never an independent completion oracle |

After discarding volatile workflow/progress state and reconstructing from
durable facts, permissions must not widen, terminal actions must not
resurrect, and outstanding obligations must not disappear. Diagnostic counts
and scheduling order need not be identical. Do not add a durable ledger just
to persist another explanation of an existing ledger.

## Replacement and settlement

Successful replacement retires the old source only after the required target
voter and leadership-handoff evidence. Failure handling depends on committed
effects: no admission, uncertain admission, admitted learner, promoted target,
and removed source are not interchangeable. A generic target-removal rollback
must never destroy the surviving replacement after source removal.

Ordinary terminal settlement, the serialized membership obligation, storage
accounting and exact-generation cleanup retain their separate existing
owners. Do not collapse these lifetimes into one DONE flag or use ordinary
terminal status as proof of committed absence. Any change to a sealed
source-retirement/cleanup contract requires explicit supersession.

## Threat model and proof claims

Protect genuine SQL/service/network mutation boundaries and private
consensus/application entry points. Separately state any requirement to
withstand arbitrary trusted-host JavaScript, mutable intrinsics or prototype
changes. Isolation and internal hardening are different claims. Do not remove
an existing protection or weaken a sealed adversarial test by silently
reclassifying its threat model. Review must remain category-complete and
independent where the existing workflow requires it.

## Execution boundaries

The current bounded execution plan belongs to
[raft-rs full cutover](../../solve/epics/raft-rs-full-cutover.md), specifically
its [contract-first plan](../../solve/epics/raft-rs-full-cutover/contract-first-2026-10-08.md).
Broader reorganization remains with core-architecture-convergence and its
activation gate. This contract is not implementation or certification proof.

## Safety-first operator mandate - 2026-10-09

The operator prioritizes a stable, non-corrupting system, accepts slower recovery
in edge cases, and delegates changes to process and design rules within that
constraint. Correctness, acknowledged obligations, and recoverability come first;
healthy-path latency, throughput, and resource cost are optimized within them.
Explicit temporary unavailability is preferable to invented success or unsafe
progress. Recovery must eventually resume when its stated prerequisites return;
fail-closed without an owned continuation is not completion.

Use the existing owners and keep the healthy path small. Distinguish recording
an immutable committed fact from granting permission for a future effect. Leases
schedule and fence new work; their expiry does not erase already committed facts
or by itself settle the outcome of a submitted operation. Every new irreversible
effect retains its own authoritative ordering, exact identity, and recovery rule.

Procedural quotas, incidental implementation choices, and performance thresholds
may be changed through an explicit, evidence-based owner decision. Safety checks,
coverage, uncertainty, and failed evidence must not be concealed by that change.
Numeric limits currently in force remain in force until their individual revision
is recorded; this mandate does not mass-relax tests or count an overrun as a pass.
Keep safety verdicts distinct from recovery-progress and performance verdicts.

The bounded learner-recording supersession and replacement proof obligations are
owned by the existing FreshMG Quest's
[safety-first ruling](../../solve/quests/message-group-fresh-identity-membership/safety-first-ruling-20261009.md).
This mandate grants design judgment, not independent source approval, a merge,
a release, or a claim of correctness under every possible hardware failure.
