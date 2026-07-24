---
audience: development
---

# Admission Decision Model

This note defines the required model for any boundary that admits, excludes,
or defers work from more than one live signal.

It exists to prevent a repeated failure pattern: observation, normalization,
and policy becoming mixed inside one retry loop until correctness depends on a
growing set of booleans and local fallbacks.

The intent is not to add more helpers. The intent is to ensure one semantic
decision is made in one place from one normalized snapshot.

## 1. Required Pipeline

Every multi-signal admission or readiness boundary must be structured as four
steps:

1. Collect observations.
2. Normalize them into one immutable decision snapshot.
3. Adjudicate the snapshot in one pure decision function.
4. Act on the decision and emit diagnostics.

Collectors may fetch, retry, and annotate evidence, but they must not return
the final admission verdict.

## 2. Evidence Classes

All observed signals must be assigned one of these classes before they can be
used in a decision:

1. Authoritative
   - Owned by the same semantic owner and plane as the decision being made.
   - May directly admit or reject.
2. Equivalent
   - Different access path to the same semantic owner and plane.
   - May confirm or refute an authoritative signal only for the equivalence
     class declared in the spec.
3. Degraded
   - Weaker, indirect, or cross-plane signal.
   - May explain reachability, downgrade error reporting, or justify retry.
   - Must not upgrade a node from blocked to admitted.
4. Contradictory
   - Conflict between authoritative or equivalent signals.
   - Produces a reconciliation state, not an immediate local exemption.

The critical constraint is simple: weaker evidence may explain or defer, but it
may not promote.

## 3. Decision Snapshot Shape

The normalized snapshot for one candidate should look like this:

```js
{
  candidate: {
    nodeId: 'node-3',
    staticEligible: true,
  },
  discovery: {
    seen: true,
    state: 'ready' | 'blocked' | 'missing' | 'contradictory',
    reasons: [],
    evidenceClass: 'authoritative',
  },
  localOwnerView: {
    state: 'ready' | 'blocked' | 'missing' | 'contradictory',
    reasons: [],
    evidenceClass: 'authoritative' | 'equivalent',
  },
  adminReachability: {
    state: 'ready' | 'blocked' | 'missing',
    reasons: [],
    evidenceClass: 'authoritative',
  },
  workloadProbe: {
    attempted: true,
    state: 'ready' | 'blocked' | 'missing',
    reasons: [],
    evidenceClass: 'equivalent' | 'degraded',
  },
  policy: {
    strictTargetCount: 5,
    allowSoftFallback: false,
  },
}
```

The exact fields may differ, but the structure must preserve three invariants:

1. Observations are recorded before policy runs.
2. Evidence class is explicit.
3. Policy inputs remain separate from observed runtime survivors.

## 4. Canonical States

The adjudicator should emit one state per candidate:

1. `excluded_static`
   - The candidate is not eligible by static policy.
   - Not retryable.
2. `awaiting_discovery`
   - No authoritative discovery proof exists yet.
   - Retryable.
3. `awaiting_admin`
   - Discovery exists, but the node is not yet admin reachable on the required
     owner path.
   - Retryable.
4. `awaiting_owner_convergence`
   - Canonical owner evidence exists and is not yet workload-ready.
   - Retryable.
5. `awaiting_equivalent_confirmation`
   - Only a spec-declared confirmable blocker remains, but no equivalent proof
     has cleared it yet.
   - Retryable.
6. `admitted`
   - Authoritative readiness is satisfied, or an allowed equivalent proof has
     confirmed the remaining blocker class.
7. `rejected_hard`
   - A non-retryable incompatibility or spec-declared hard blocker exists.

The state set is intentionally small. If a new fix requires another boolean
branch, first ask whether it is actually a new state, a new reason code within
an existing state, or evidence that one state should be split in the spec.

## 5. Adjudication Rules

The pure decision function must apply these rules in order:

1. Static ineligibility wins first.
2. Missing authoritative evidence produces a waiting state, not local
   reconstruction.
3. Hard blockers may reject immediately only if the spec marks them
   non-retryable.
4. Equivalent proof may clear only the blocker classes for which equivalence is
   explicitly declared.
5. Degraded proof may not clear workload or admission blockers.
6. Contradictory evidence produces a reconciliation state with explicit reason
   codes.
7. Policy targets, such as required cohort size or strict parity, must not be
   rewritten from whichever candidates happened to survive this attempt unless
   an owner-defined degradation policy says so.

## 6. Diagnostics Contract

The adjudicator output must be rich enough that callers do not need to inspect
raw evidence again. Each verdict should include:

1. `state`
2. `admit`
3. `retryable`
4. `reasonCodes`
5. `evidenceUsed`
6. `missingProof`

That output becomes the only legal source for cohort selection, retry
decisions, and human-readable diagnostics.

## 7. Test Requirements

Every multi-signal decision boundary must ship with:

1. Table-driven unit tests for each state and blocker class.
2. At least one regression proving degraded evidence cannot promote a candidate
   to admitted.
3. Replay-driven tests or fixtures for previously failing artifacts.
4. A regression proving policy targets stay distinct from incidental admitted
   survivors when strict policy is enabled.

## 8. Concrete Refactor Boundary For The Distributed Harness

For the current distributed harness admission path, the next refactor should
separate the existing logic like this:

1. Keep observation-only helpers:
   - discovery evaluation
   - local replica extraction
   - admin reachability probe
   - workload-plane probe
2. Add one snapshot builder that records all evidence for a node without making
   the admission decision.
3. Add one pure `adjudicateNodeAdmission(snapshot, policy)` function that emits
   the canonical state and verdict.
4. Reduce the outer retry loop to:
   - collect evidence
   - adjudicate per node
   - aggregate admitted nodes
   - stop or retry
5. Keep strict policy targets owned by explicit scenario policy, not by the
   number of nodes that happened to be admitted on a given attempt.

This keeps the outer scenario as the phase machine and turns the inner node
admission boundary into an explicit state model instead of an accumulating
branch lattice.