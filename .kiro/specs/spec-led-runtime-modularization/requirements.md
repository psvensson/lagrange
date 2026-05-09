# Spec-Led Runtime Modularization Requirements

## Requirement 1: Contracts Precede Runtime Rewrites

Each runtime rewrite package must first declare:

1. Semantic owner.
2. Canonical raw inputs.
3. Forbidden raw inputs.
4. Scalar and variant owner for every domain/runtime value.
5. Explicit absence semantics for missing, stale, unavailable, or unknown
   evidence.
6. Normalized evidence shape.
7. State vocabulary.
8. Decision table.
9. Emitted outcome shape.
10. Allowed effects.
11. Allowed consumers.
12. Forbidden reinterpretations.
13. Legacy paths to delete or structurally block.

No runtime module may be replaced by speculative cleanup without this contract.
Blank template entries, placeholder states, or raw `null` and `undefined`
state encodings block runtime implementation.

## Requirement 2: Decisions Are Pure

Owner decisions must be pure functions of normalized evidence.

They must not:

1. Read SQL, cache, timers, transport, or filesystem directly.
2. Schedule runtime effects.
3. Log as a decision mechanism.
4. Interpret another owner's raw rows.
5. Emit several partial verdicts that consumers recombine.

## Requirement 3: Effects Are Commands

Effect modules may run commands such as dispatch, publish, wake remote owner,
schedule retry, persist transition, or emit diagnostic events.

Effect modules must not:

1. Reopen semantic evidence.
2. Reclassify owner state.
3. Add fallback branches around owner outcomes.
4. Mark terminal success or failure for another owner.

## Requirement 4: Operation Owner Owns Workflow Progress

The operation owner owns durable topology operation lifecycle, workflow
progress, retry, resume, timeout reconcile, serial wait, and terminal outcome.

Priority recovery snapshots, rebalancer paths, harness reports, and admin
diagnostics may observe operation outcomes. They must not decide whether
workflow progress should advance, retry, reconcile timeout, or remain blocked.

## Requirement 5: Priority Recovery Is Observation Plus Requests

Priority recovery may:

1. Observe canonical owner outcomes.
2. Identify spread gaps and follow-up needs.
3. Request placement or operation work through owner contracts.
4. Format blocked, deferred, retryable, terminal, and ready states.

Priority recovery must not:

1. Locally rewrite operation-owner timeout evidence into workflow progress.
2. Schedule operation re-entry from diagnostics-only snapshots.
3. Treat absence, `null`, or `undefined` as domain state.
4. Maintain a shadow grammar for operation progress.

## Requirement 6: Diagnostics Are Read-Only Consumers

Failure bundles, topology convergence analysis, active gates, admin summaries,
and report writers may format, rank, and explain owner outcomes.

They must not:

1. Infer admission, placement, workflow progress, publication convergence, or
   readiness from raw logs or probes.
2. Merge fallback snapshots into stronger truth than the owner emitted.
3. Hide unresolved owner evidence behind presentation-only labels.

## Requirement 7: Modularity Targets Are Enforced

New runtime modules should target:

1. One owner concern per file.
2. Pure decision modules under 400 lines where practical.
3. Production JavaScript files under the repository 800-line ratchet.
4. Test files under the repository 1200-line ratchet.
5. No new circular dependencies between owner packages.
6. No new import path from diagnostics into owner decision modules.

If an existing oversized file must remain during cutover, the package must say
why and name the next extraction boundary.

## Requirement 8: Deletion Is Part Of Done

A rewrite package is not complete when the new path passes focused tests.

It is complete only when:

1. Tail consumers use the new contract.
2. Old branch logic is deleted or guarded from new imports.
3. Diagnostics match the new contract.
4. Representative proof passes or migrates to one named successor boundary.
5. Static guardrails and work tracker validation pass.

## Requirement 9: Runtime Packages Freeze One Contract

Before a queued runtime package edits production or test code, it must freeze
one filled module contract in the package file or a linked spec subsection.

The frozen contract must:

1. Name one semantic owner and one owner boundary.
2. Map every accepted raw input to normalized evidence.
3. Name every rejected raw input and the reason it is forbidden.
4. Make the decision table total for the package-owned evidence states.
5. Name the deletion, quarantine, or structural guard target.
6. Name the focused proof and the representative proof or migration probe.
