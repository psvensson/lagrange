---
id: publication-readiness-churn-liveness-closure
status: active
roadmapRow: null
graduatesTo: readiness-planning-owner-boundary-atomic-closure
---

# Publication/readiness churn liveness closure

## Intent

Close the recurring MovieLens formation and publication stalls at their shared
owner boundary. Readiness planning must consume one complete, versioned view of
its semantic inputs; schedule heavy rebuilds with bounded fair progress; and
deliver completion wakes only after downstream acceptance. This finishes the
half-wired owner contract rather than adding another cadence throttle or local
readiness exception.

The implementation Quest is
`readiness-planning-owner-boundary-atomic-closure`. Its sealed statement and
constraints are the execution authority for this memo.

## Why the earlier hardening was insufficient

The gold-plating program protected several individual cross-module premises,
but publication/readiness planning still had no single atomic contract spanning
input freshness, scheduling, authoritative reads, and completion delivery.
Consequently, locally correct mechanisms could still compose into starvation:

- rebuild cadence was reduced, while unversioned or incompletely versioned
  semantic changes could still invalidate a positive decision;
- per-owner work existed, while formation priority and retry reentrancy could
  evade bounded round-robin progress;
- readiness-internal reads existed, while their structural purpose was not
  preserved across every production routing layer;
- completion notifications existed, while the token could be consumed before
  downstream enqueue succeeded.

The closure therefore treats producer generations, the planning owner, the
owner-key scheduler, authoritative routing, dispatch consumption, and their
proof as one owner-boundary contract.

## Owned invariants

1. `readiness-source-freshness-eventually-reflected`: every semantic readiness
   input participates in an injective version token or a registered live veto;
   stale evidence never promotes readiness and the final quiescent token is
   eventually published.
2. `readiness-heavy-work-turn-bounded`: at most one heavy planning build starts
   per macrotask turn, continuously dirty owners receive bounded round-robin
   service, and retry exhaustion cannot be bypassed by same-owner reentrancy.
3. `readiness-owner-read-non-amplifying`: a readiness-internal owner read keeps
   its structural purpose through the production query/owner route and never
   recursively requires full readiness.
4. Completion delivery is commit-after-success: a notification token is not
   consumed until downstream dispatch accepts it, and transient failures retain
   a bounded recoverable wake.

## Proof ladder

The implementation is not complete until all layers agree:

1. Red-first deterministic regressions reproduce freshness collisions,
   over-cap option pressure, retry reentrancy, hostile intrinsic mutation,
   recursive owner reads, and lost completion wakes.
2. The production-composition churn test crosses the actual membership,
   readiness, owner-read, cache, transport, lifecycle, and dispatch owners and
   retains each guard's TAP output in the scenario report.
3. `models/readiness-starvation/VersionedReadinessPlanning.tla` converges in the
   fixed configuration while each raw-event, recursion, stale-positive,
   undeclared-dependency, and formation-priority mutant violates its expected
   property.
4. An independent verifier attacks the exact aggregate candidate using every
   applicable verification-template category and approves its content-bound
   fingerprint.
5. Only after deterministic approval, the sealed one-time GCP certification
   runs: one profiled discriminator followed by three natural source-bound
   five-node MovieLens runs meeting the Quest's timing, publication, identity,
   and gap bars.

## Non-goals and rejection conditions

- Do not raise startup, election, readiness, or scenario budgets.
- Do not reduce the five-node cohort or weaken source/artifact identity checks.
- Do not introduce another readiness cache, scheduler, or call-site throttle.
- Reject the approach if any semantic input remains outside the version/live-
  veto contract, any same-owner path can evade boundedness, a completion wake
  can be lost, or the production route does not engage the new owner.

## Completion

This epic resolves only when the implementation Quest reaches its measured
terminal state and lands its exact independently approved aggregate. A green
deterministic suite without the sealed live certification is necessary but not
sufficient.
