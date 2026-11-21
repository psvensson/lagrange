---
audience: development
documentClass: current
---

# Authority and recovery

<!-- system-contract
{
  "schema": "system-contract-v1",
  "contractId": "authority-and-recovery",
  "status": "active",
  "owners": [
    {
      "owner": "architecture_owner",
      "boundary": "authority_and_recovery"
    }
  ],
  "failureClasses": [
    "projections, caches, or diagnostic observations can be treated as independent completion or permission authorities",
    "recovery prerequisites can depend circularly on full serving readiness or derived projections",
    "recoverable refusals can silently abandon acknowledged obligations or synthesize success on timeout"
  ],
  "stateVariables": [
    "declaredPolicy",
    "durableObligation",
    "committedConsensusFact",
    "physicalGeneration",
    "volatileExecutionState",
    "observationProjection"
  ],
  "safetyInvariants": [
    {
      "id": "authority-and-recovery-single-fact-owner",
      "statement": "Each authoritative fact has one semantic owner; projections and caches trigger reconciliation without granting permission or discharging durable obligations."
    }
  ],
  "livenessExpectations": [
    {
      "id": "authority-and-recovery-non-circular-progress",
      "statement": "Recovery actions acquire minimal authoritative facts without circularly requiring full serving readiness and resume when stated prerequisites return."
    }
  ],
  "knownResiduals": [
    "Subsystem-specific transition rules and fences remain governed by their respective owner contracts and sealed Quests."
  ],
  "runtimeBindings": [
    {
      "path": "src/node/replica-handler-release-recovery.js",
      "owner": "participant_release_recovery_owner",
      "boundary": "authority_and_recovery",
      "transition": "volatile participant-release continuation observes held runtimes and re-drives canonical release without granting authority"
    },
    {
      "path": "src/node/replica-handler-participant-release.js",
      "owner": "participant_release_owner",
      "boundary": "authority_and_recovery",
      "transition": "canonical participant pause and resume mutation fenced by live handler, service, and generation"
    }
  ],
  "modelBindings": [
    {
      "kind": "structural-constraint",
      "artifact": "scripts/participant-release-completion-audit.js",
      "properties": "verifies single decision algorithm and owner authority for participant release completion"
    }
  ],
  "metrics": [
    {
      "name": "system contract validation",
      "probe": "npm run model:contract-records"
    }
  ],
  "questRefs": [
    "solve/quests/participant-release-completion-owner/quest.json"
  ],
  "theoryLedgerRefs": [
    "theory-20260522-experiment-theory-memory"
  ],
  "failureAnalysis": {
    "fmea": [
      {
        "failureMode": "projection or timeout is treated as completion or permission grant",
        "severity": "high - can drop durable obligations or violate generation fences",
        "detectability": "high - audited by owner boundary and participant release checks",
        "mitigation": "keep one semantic owner per durable fact and fail closed on unknown outcomes with an owned continuation",
        "probe": "npm run model:contract-records"
      }
    ],
    "stpa": [
      {
        "controller": "architecture_owner",
        "unsafeAction": "allows volatile observation or cache projection to widen permissions or discharge an unresolved obligation",
        "feedbackSignal": "durable operation rows, committed consensus state, and physical generation fences",
        "ownerBoundary": "architecture_owner / authority_and_recovery"
      }
    ]
  }
}
-->

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
Persist what safety and recovery require; recompute disposable schedules,
indexes of work and presentation. An owner may retain evidence of an immutable
committed fact under a contract that identifies its exact subject and provenance,
explains why it remains valid across later attempts or generations, and defines
its retention bound and recovery after process loss. State which changes
invalidate the evidence and which do not.

An unavailable later read does not by itself invalidate a previously established
immutable fact. Retaining that fact does not grant permission for a new effect:
current authorization, membership, generation and admission conditions remain
governed by their owners. Reuse must preserve that distinction. If the applicable
contract requires fresh evidence, changing that requirement needs an explicit
contract revision and its affected proof; memoization cannot silently supersede it.

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

### Owner fact and hint

A control-plane read that an owner schedules or proposes on is one of two
canonical reads (`src/control-plane/control-plane-owner-fact-read.js`). A
**hint** (`readHint`) is the node's projection: it may schedule a turn, it
carries no identity and it cannot be passed where an owner fact is required.
An **owner fact** (`readOwnerFact`) is READY with rows and the serving
replica's witness, or UNAVAILABLE with a named reason; an empty READY is the
only absence. Neither read authorises an effect: an effect is granted by a
conditional committed write that revalidates its own predicate.

The safe read point of an owner fact is decided by the replica that answers,
at its receiver (`PartitionService.handleRemoteQuery`), on its raft core's
current authority observation (`observeCurrentAuthority`: read, never driven,
never cached): it leads (a leader that has not applied an entry of its term
while a turn pends is reported not settled, which is not leading); it has
applied an entry of its own term (`currentTermApplied`; by Raft's leader
completeness its log holds every entry an earlier leader committed, and it
commits them only through such an entry); its applied position is not behind the commit
index it observed; and the caller's floor, a position `{partitionId, index,
term}` typed by the raft group it was taken in, names this partition and is
met. A read on a connection inside a transaction the receiver did not open is
refused. The rows and the applied position the witness names are read in one
read transaction of the replica's one SQLite connection (the statement and the
raft store's applied-state row), with no await after that status; after the
read the replica checks it still leads in the same term; otherwise it refuses
typed and ships no rows. The witness echoes the read it decided (kind and
floor); `readOwnerFact` accepts only an answer that echoes its own request,
and the gateway never shares one owner fact's read with a read of another
kind, floor or deadline.
Each decision is the core's state at that instant, not the status of its last
completed turn. The node that hosts the replica reaches the same
receiver in process; every other node reaches it over the query transport,
redirect-first, inside the original request's deadline, under the routing
class the caller states.

This is a leader-local read point, not a linearizable read: no quorum round
confirms leadership when the rows are read, and the serving replica's role is
its own local belief. With `check_quorum`, a leader cut off from its quorum
checks its quorum contact once per election timeout over the activity since
the previous check, so, while its core turns run, it steps down after one to
two election timeouts counted in its own ticks: `electionTick = max(heartbeatTick
+ 1, ceil(electionMinMs / tickMs))`, `tickMs = floor(heartbeatMs / 3)`
(`src/raft/raft-rs-runtime-tuning.js:14-37`,
`src/raft/raft-rs-group-constants.js:18-23`); at the defaults (election
minimum 1000 ms, heartbeat 50 ms: 16 ms ticks, 63 ticks) that is about 2 s,
longer in wall time when the event loop stalls. That bound does not hold while
a core turn is pending: the leader's ticks queue behind the turn, so a cut-off
leader may not step down for as long as the turn pends (up to the persistence
admission bound, 120 s, `src/raft/raft-rs-runtime-owner-constants.js:240`).
What protects an owner fact is the receiver's refusal unless its raft core's
current observation is the settled leader answer, not the step-down; until the
raft owner reports a leader unsettled while a newer-term envelope waits in its
own inbound queue (verification B-1,
`test/cdc/cdc-owner-fact-queued-successor-acceptance.test.js`, red until then),
such a leader can answer for as long as its turn pends. Otherwise an owner fact
is the leader's applied state, stale by at most the step-down bound when it
was answered, plus the answer's transit, which the caller's deadline bounds.

Precondition for consumers: an absence-dependent consumer (one that concludes
from an empty result that a row does not exist) may rely only on `readOwnerFact`,
whose receiver refuses an insufficient read point
(`test/cdc/cdc-owner-fact-receiver-read-point.test.js`). Every other
leader-REQUIRED read is qualified only by the serving replica's leader role and
can answer a row its leader's predecessor committed as absent
(`test/cdc/cdc-leader-required-fresh-leader-absence.test.js`, open); its
consumers keep that gap until they migrate. For a consumer left temporarily on
the older path, an effect-time condition is protective only if it revalidates
the relevant predicate; an unrelated conditional write does not make a stale
absence decision safe.

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

The bounded execution plan belongs to
[raft-rs full cutover](../../solve/epics/raft-rs-full-cutover.md), specifically
its [contract-first plan](../../solve/epics/raft-rs-full-cutover/contract-first-2026-10-08.md);
the downstream `FreshMG` slices (`6.A`-`6.D`), `TX1`, and `SN1` are wired in
production (`0.2.6`). Broader reorganization remains with
core-architecture-convergence and its activation gate. This contract defines
its specific boundary slice and is not itself certification proof.

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

## Failure Classes

Projections, caches, or timeouts can be mistaken for completion authorities, and
recovery paths can deadlock if they depend circularly on full serving readiness.

## Invariants

Each authoritative fact has one semantic owner, and recovery reconstructs from
durable facts without widening permissions or dropping unresolved obligations.

## Runtime Bindings

Runtime bindings connect participant release recovery and canonical pause/resume
owners to the single-decision-algorithm authority discipline.

Membership-node binding: the node a raft-rs group member runs on is owned by the
raft-rs runtime owner's committed identity record (`raft_rs_peer_identity.node_id`,
written from the committed admission context, founding or joining stamp, or
snapshot image); services rows and caches are discovery only. The binding holds
for partition groups; message groups still resolve peers from cache and hints, and
FreshMG learners commit no node (named follow-up, transition record section 8,
item 6). Transition record:
`docs/evidence/learner-host-from-committed-admission-2026-11/transition.md`.

## Model Bindings

Structural audit scripts verify single-owner completion rules and contract
metadata integrity.

## Operational Analysis

FMEA and STPA bind the controller boundary so volatile observations trigger
reconciliation without synthesizing success or revoking committed facts.
