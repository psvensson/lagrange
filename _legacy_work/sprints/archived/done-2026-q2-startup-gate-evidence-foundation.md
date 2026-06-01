# Startup Gate Evidence Foundation Sprint (AGPL)

## Goal

Collapse startup-readiness truth into a single adjudication model so active-gate
decisions are sourced from one place, with deterministic policy across probe,
snapshot, and witness paths.

## Status

Closed on 2026-04-11 as exploratory staging only. The useful parts of this
work were absorbed by later readiness-semantics unification and startup-authority
work, so no standalone executable queue remains here.

## Why This Sprint Exists

Recent distributed harness findings show duplicated startup-admin semantics between
`cluster.js` and closure classification, plus brittle transient-timeout
classification that can produce inconsistent activeness outcomes under restart and
load pressure.

## Sprint Umbrella

This file owns the foundation work for startup active-gate correctness:

1. [Startup admin-snapshot evidence ownership unification](../../packages/archived/done-20260410-startup-readiness-evidence-owner-unification.md)
2. [Startup timeout/error taxonomy normalization](../../packages/archived/done-20260410-startup-timeout-error-taxonomy.md)

## Completed Packages

None.

## Active Queue

None. The staged work was absorbed into later readiness and startup-authority
work; no standalone queue remains worth keeping open here.

## Out-of-Scope for This Sprint

1. Non-distributed test harness runtime behavior.
2. Priority recovery protocol redesigns outside startup gate admission.
3. Service lifecycle or bootstrap feature work.

## Rollout Order

1. Introduce a shared evidence model for startup activeness.
2. Consolidate timeout/transient/error classification into that shared model.
3. Rewire both `cluster.js` and `active-gate-closure-classification.js` call
sites to consume the shared owner path.
4. Run the current distributed harness smoke set for startup-focused
stabilization scenarios before moving to witness/state machine hardening.

## Exit Check

Closed. Shared readiness evidence and timeout classification were later handled
through broader readiness-unification work, so this staging sprint no longer
carries separate executable work.
