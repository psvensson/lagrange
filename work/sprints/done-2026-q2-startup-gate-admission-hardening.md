# Startup Gate Admission and Witness Hardening Sprint (AGPL)

## Goal

Separate strong active-state admission from degraded/waiting acceptance and make
active-gate closure witnesses require independent evidence instead of transient
admin reachability alone.

## Status

Closed on 2026-04-11 as exploratory staging only. The useful admission and
witness-hardening pieces were absorbed into later readiness-classification,
selected-seed, and harness work, so no standalone queue remains here.

## Why This Sprint Exists

Current startup fast-path behavior can mark nodes active on transient evidence and
accept CL-004/CL-006 closure witnesses while snapshot/publication evidence is
incomplete, especially under `diag-admin-discovery`-class failures.

## Sprint Umbrella

This sprint depends on the evidence foundation and executes the policy split:

1. [Active-state transition split (strong vs degraded admission)](../packages/done-20260410-active-state-vs-degraded-admission.md)
2. [Active gate witness hardening for CL-004/CL-006](../packages/done-20260410-active-gate-witness-hardening.md)
3. [Startup active-gate harness regression package](../packages/done-20260410-active-gate-harness-regression-pack.md)

## Completed Packages

None.

## Active Queue

None. The staged work was absorbed into later readiness and startup-authority
packages; no separate queue remains worth keeping open here.

## Out-of-Scope for This Sprint

1. Non-harness ownership changes to membership publication selection logic.
2. Bootstrap admission redesign outside active-gate startup mode.
3. New feature work in installable service ecosystem.

## Rollout Order

1. Split active projection from degraded-wait semantics in active-gate probing.
2. Restrict CL witness derivation to evidence-strength prerequisites.
3. Encode and run scenario-level regression checks for startup and diagnostics
   paths.

## Exit Check

Closed. Later readiness-classification and startup-authority work absorbed the
useful pieces, so this sprint no longer carries separate executable work.
