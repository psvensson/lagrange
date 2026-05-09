# Best-Of-Breed Tactical Guidance

The repository specifications remain authoritative. The systems below provide
tactical patterns only.

## Kubernetes Controllers

Use when replacing branch piles around readiness, publication, or operation
progress.

Tactics:

1. Normalize observed state and desired state once.
2. Reconcile to one named outcome.
3. Persist owner-owned status conditions with reasons.
4. Treat caches and informers as observation channels, not authoritative
   completion proof.

Avoid:

1. Long controller loops inside event handlers.
2. Local consumers rebuilding owner status from raw resources.

## Temporal And Cadence

Use when replacing operation workflow and retry logic.

Tactics:

1. Treat workflow history as the durable source of progress.
2. Emit deterministic commands from owner decisions.
3. Let workers execute commands and report results.
4. Keep retry, timeout, and terminal outcome in the workflow owner.

Avoid:

1. Participant code persisting owner-managed workflow transitions.
2. Timer handlers rewriting terminal state.

## Raft And KRaft Metadata Controllers

Use when replacing publication and metadata visibility paths.

Tactics:

1. One owner appends ordered metadata transitions.
2. Observers consume committed revisions.
3. Consumers compare revisions rather than raw cache presence.
4. Diagnostics explain lag without completing convergence.

Avoid:

1. SQL fallback reads becoming an alternate publication owner.
2. Diagnostics-only snapshots acknowledging publication.

## Kubernetes Scheduler And CockroachDB Allocator

Use when replacing placement and recovery scheduling.

Tactics:

1. Split filtering, scoring, reservation, and intent emission.
2. Keep placement policy separate from operation actuation.
3. Use reasons for rejected candidates.
4. Do not let pressure branches mutate policy targets.

Avoid:

1. Survivor-set fallback as placement policy.
2. Recovery paths inventing assignment intent from partial cache evidence.

## etcd And Watch-Based Consumers

Use when replacing readiness and projection consumers.

Tactics:

1. Attach source revision to projection/readiness snapshots.
2. Make stale, fresh, deferred, and failed visibility explicit.
3. Let consumers retry or wait based on named states.

Avoid:

1. Treating absence as readiness state.
2. Merging stale fallback snapshots into stronger truth than the owner emitted.

## SRE Diagnostic Pipelines

Use when replacing failure bundles and active-gate reporting.

Tactics:

1. Rank canonical owner witnesses.
2. Select one dominant blocker with reasons.
3. Preserve subordinate evidence without changing the owner decision.
4. Keep presentation logic side-effect free.

Avoid:

1. Classification from raw logs when owner outcomes exist.
2. Report relabeling that hides a live owner blocker.

## Local Contract Mapping

| Reference tactic | Local design rule | Forbidden shortcut |
| --- | --- | --- |
| Kubernetes reconcile loop | Normalize evidence once, then emit one owner outcome with reasons. | Event handlers making partial semantic decisions. |
| Temporal command history | Operation owner decides progress and commands; workers only execute and report. | Participant or timer code rewriting workflow truth. |
| Raft/KRaft metadata owner | Publication owner emits ordered revisions consumed by observers. | SQL fallback or diagnostics completing publication. |
| Scheduler filter/score/reserve | Placement owner separates candidate policy from actuation intent. | Pressure branches mutating placement targets. |
| etcd/watch freshness | Projection/readiness carries source revision and named freshness state. | Cache presence or raw absence as convergence proof. |
| SRE witness ranking | Diagnostics rank canonical owner witnesses. | Failure bundles reclassifying raw runtime traces. |
