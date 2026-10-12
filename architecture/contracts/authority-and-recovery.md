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

## Authority-reduction review contract

Draft addition for the operator-requested release reduction, 2026-10-12;
independent design review and normal landing remain required. This section
elaborates the existing owner rules; it adds no always-loaded rule or registry.

Before adding or retaining a state, counter, projection, handshake, persistent
record or retry path, put this inventory in the owning Quest's design:

`fact -> sole writer/commit point -> identity and lifetime -> consumers ->
invalidators -> remaining obligation -> continuation/release owner`.

The inventory describes semantic facts, not one row per class. Two representations
of the same permission are a defect unless one is explicitly a disposable view
whose consumers return to the authority. Distinct facts must not be collapsed
merely to reduce the number of fields: durable pause ordering and revocation of
one local dispatch submission, for example, have different lifetimes.

For every proposed addition, name the decision or failure boundary it alone
owns and an executable falsifier of that distinction. For every proposed
removal, name all callers, apply predicates, restart consumers, outstanding
obligations and witnesses that depended on it. Move the whole interaction;
deleting a producer while its dispatch fence still consumes it is a rejection.
A state that changes neither permissible effects nor remaining obligations is
a derived observation, not another authoritative protocol phase.

All triggers for one transition converge on one driver and winner rule. State
both the process-local scheduling scope and the durable/leader fencing scope;
a local single-flight is not distributed serialization. A retry cannot mint a
new semantic identity, renew the caller's deadline or choose a different root
merely because its previous answer was lost. A recoverable refusal names an
actually reachable continuation, including pre-origin and remote-leader cases.

Keep durable decisions separate from live observations and physical history.
Dropping volatile state must not grant new effects or erase retirement debt.
An absent projection is not proof that no obligation existed; an unavailable
record is not proof of an empty store. Do not introduce a release-owned store
or history token to repair a lifecycle or reseed owner defect.

The review must contain an explicit accepted-clause and witness disposition
map. Retain old evidence byte-for-byte. Every supersession names its authority,
replacement invariant and both positive and refusal witnesses. "Fewer lines",
"tests pass", and a declaration of single ownership do not prove the reduction.

Use existing owner-interaction witnesses and audits for enforceable boundaries.
The verifier must identify a negative case that the existing gate rejects, or
record a scoped enforcement gap; prose alone is not machine enforcement. No new
checker, manifest or coordinator may duplicate the owner it is meant to police.
This contract does not promise that a static check can prove semantic uniqueness.
