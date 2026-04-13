# Bootstrap and Runtime Guideline Cleanup Batch 1

## Why

The detector work is in place, but the current cleanup stream was still partly
implicit. This package records the concrete runtime files being cleaned now so
the work can stop and resume without losing the exact backlog.

## Sprint Umbrella

[Runtime Contract Hardening and Explicit State Elimination Sprint](../sprints/active-2026-q2-runtime-contract-hardening-and-explicit-state-elimination.md)

## Scope

This batch is limited to active runtime/bootstrap files that are currently
showing decision-boundary or literal-guideline violations and are on live
startup, control-plane, or runtime paths.

Current file set:
1. `src/bootstrap/lifecycle-controller.js`
2. `src/bootstrap/pgwire-startup-safety-gate.js`
3. `src/bootstrap/rejoin-hints.js`
4. `src/control-plane/authoritative-node-evidence-reconciler.js`
5. `src/bootstrap/join-readiness-evaluator.js`

## Invariants

1. No new `null` or `undefined` state presentation may be introduced while
   refactoring these files.
2. Decision-boundary fixes and literal fixes must be applied together in the
   same touched files.
3. Existing owners/services must be reused; no new framework or parallel layer.
4. Regressions must be caught with focused unit suites before moving on.

## Tasks

- [x] Repair the `join-readiness-evaluator` regression introduced during cleanup
      and restore the failing bootstrap tests.
- [x] Refactor `lifecycle-controller.evaluate()` to one explicit outcome path.
- [x] Refactor `pgwire-startup-safety-gate.checkControlPlaneReady()` to one
      explicit non-null readiness contract.
- [x] Refactor `rejoin-hints.resolveAutoRejoinStartupDecision()` without adding
      new nullable state.
- [x] Refactor `authoritative-node-evidence-reconciler.repairNodeEvidence()` to
      one explicit repair outcome path.
- [ ] Run both detectors on every touched file until they report `0`.
- [ ] Rerun the touched bootstrap/control-plane unit suites.

## Done When

1. Every file in this batch reports `0` literal violations.
2. Every file in this batch reports `0` decision-boundary violations.
3. The touched bootstrap/control-plane suites pass.
4. No new nullable state has been introduced in these paths.

## 2026-04-12 execution update

Completed:
1. `join-readiness-evaluator` regression fixed.
2. `node test/bootstrap/node-joining-service.test.js` passed again.
3. `node test/bootstrap/node-joining-ready-signal-retry.test.js` passed again.
4. Focused detector reruns for the touched cleanup files passed.
5. Focused bootstrap/control-plane suite reruns for the touched cleanup files
   passed.

Current implementation note:
1. `src/bootstrap/lifecycle-controller.js` now routes `evaluate()` through one
   explicit evaluation-state adjudicator instead of deriving phase/readiness
   through scattered branch assignments.
2. The touched `lifecycle-controller` scalars in that slice now have
   file-private owners.
3. `src/bootstrap/pgwire-startup-safety-gate.js` now emits one explicit
   readiness decision with a named blocking dependency.
4. `src/bootstrap/rejoin-hints.js` now derives one auto-rejoin decision state
   from a normalized durable snapshot before building the startup contract.
5. `src/control-plane/authoritative-node-evidence-reconciler.js` now routes
   authoritative repair through one explicit repair-state adjudicator.
6. Focused detector/test reruns for the batch are green:
   `node scripts/check-guideline-literals.js src/bootstrap/lifecycle-controller.js src/bootstrap/pgwire-startup-safety-gate.js src/bootstrap/rejoin-hints.js src/control-plane/authoritative-node-evidence-reconciler.js`
   `node scripts/check-guideline-decision-boundaries.js src/bootstrap/lifecycle-controller.js src/bootstrap/pgwire-startup-safety-gate.js src/bootstrap/rejoin-hints.js src/control-plane/authoritative-node-evidence-reconciler.js`
   `node test/bootstrap/lifecycle-controller.test.js`
   `node test/bootstrap/pgwire-startup-safety-gate.test.js`
   `node test/bootstrap/rejoin-hints.test.js`
   `node test/control-plane/control-plane-readiness-service.test.js`
